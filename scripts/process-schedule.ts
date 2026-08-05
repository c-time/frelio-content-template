/**
 * 予約反映（時刻ベースの自動公開/非公開）の実行スクリプト
 *
 * schedule-queue.json の「期限到来（scheduledAt <= now）かつ pending」なスロットを処理し、
 * 各スロットのアクション（publish/unpublish）を作業ツリーへ適用する。
 * 派生ファイル更新（コンテンツ移動・ビューインデックス・ダッシュボードメタデータ）は
 * content-ops の applyScheduledTransition を使い、CMS と同じ結果を再現する。
 *
 * git 操作はしない（呼び出し側のワークフローがコミットする）。
 * 処理したアクション数を $GITHUB_OUTPUT の `processed` に出力する（0 ならデプロイをスキップ）。
 *
 * @example
 *   npx tsx scripts/process-schedule.ts
 *   npx tsx scripts/process-schedule.ts --dry-run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { dirname } from 'path'
import { parseArgs } from 'util'
import { appendFileSync } from 'fs'
import {
  applyScheduledTransition,
  SCHEDULE_QUEUE_PATH,
  CONFIG_PATH,
  DEFAULT_SCHEDULE_QUEUE,
  type ContentStorePort,
  type FileChange,
  type ScheduleQueue,
  type ScheduleSlot,
} from '@c-time/frelio-content-ops'

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
  },
})
const DRY_RUN = values['dry-run']!

function log(...args: unknown[]) {
  console.log('[schedule]', ...args)
}

/**
 * fs をベースに、実行中の変更を保持するオーバーレイストア。
 * 同一スロット内の複数アクションが、直前アクションのインデックス/メタデータ更新を参照できる。
 */
function createOverlayStore() {
  // path -> content 文字列（null = 削除）
  const overlay = new Map<string, string | null>()

  const store: ContentStorePort = {
    async readJson<T>(path: string): Promise<T | null> {
      if (overlay.has(path)) {
        const v = overlay.get(path)!
        return v === null ? null : (JSON.parse(v) as T)
      }
      if (!existsSync(path)) return null
      try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T
      } catch {
        return null
      }
    },
  }

  function stage(changes: FileChange[]) {
    for (const c of changes) {
      overlay.set(c.path, c.delete ? null : c.content)
    }
  }

  function flush() {
    for (const [path, content] of overlay) {
      if (content === null) {
        if (existsSync(path)) rmSync(path)
      } else {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, content.endsWith('\n') ? content : content + '\n')
      }
    }
  }

  return { store, stage, flush }
}

function isDue(slot: ScheduleSlot, nowEpoch: number): boolean {
  if (slot.status !== 'pending') return false
  const at = Date.parse(slot.scheduledAt)
  if (Number.isNaN(at)) return false
  return at <= nowEpoch
}

async function main() {
  const { store, stage, flush } = createOverlayStore()

  const queue =
    (await store.readJson<ScheduleQueue>(SCHEDULE_QUEUE_PATH)) ?? DEFAULT_SCHEDULE_QUEUE
  const config = await store.readJson<{ saveTimezone?: string }>(CONFIG_PATH)
  const saveTimezone = config?.saveTimezone ?? ''

  const nowDate = new Date()
  const now = nowDate.toISOString()
  const nowEpoch = nowDate.getTime()

  const dueSlots = queue.slots.filter((s) => isDue(s, nowEpoch))
  log(`due slots: ${dueSlots.length} / total ${queue.slots.length}`)

  let processedActions = 0

  for (const slot of dueSlots) {
    const slotChanges: FileChange[] = []
    try {
      for (const action of slot.actions) {
        const changes = await applyScheduledTransition(store, {
          action,
          updatedBy: slot.createdBy || 'scheduled-publish',
          now,
          saveTimezone,
        })
        // 直後のアクションが参照できるよう、都度オーバーレイへ反映
        stage(changes)
        slotChanges.push(...changes)
        processedActions++
        log(`applied ${action.action}: ${action.contentTypeId}/${action.contentId}`)
      }
      slot.status = 'done'
      slot.executedAt = now
      slot.error = null
    } catch (err) {
      // スロット単位で失敗を記録（適用済みの変更はオーバーレイに残るが、
      // failed マークで再実行対象外にする。部分適用の是正は運用で対応）
      slot.status = 'failed'
      slot.executedAt = now
      slot.error = err instanceof Error ? err.message : String(err)
      log(`slot failed @${slot.scheduledAt}: ${slot.error}`)
    }
  }

  // キューを更新（状態変化を反映）
  stage([{ path: SCHEDULE_QUEUE_PATH, content: JSON.stringify(queue, null, 2) }])

  if (DRY_RUN) {
    log(`dry-run: would process ${processedActions} action(s) in ${dueSlots.length} slot(s)`)
  } else if (dueSlots.length > 0) {
    flush()
    log(`processed ${processedActions} action(s) in ${dueSlots.length} slot(s)`)
  } else {
    log('nothing due')
  }

  // ワークフローへ処理件数を伝える（0 ならデプロイをスキップ）
  const out = process.env.GITHUB_OUTPUT
  if (out) {
    appendFileSync(out, `processed=${processedActions}\n`)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
