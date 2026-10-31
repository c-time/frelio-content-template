/**
 * 予約反映のデプロイ結果をキューへ反映するスクリプト（finalize ジョブ）
 *
 * process ジョブは期限到来スロットを develop へ適用し status を `done` にして先にコミットするため、
 * その後の deploy ジョブが Cloudflare 一時障害（10013 等）で落ちても、スロットは `done` のまま残る＝
 * 「公開したつもりで公開されていない」サイレント失敗になる。
 *
 * このスクリプトは deploy の後に always() で走り、デプロイが失敗していたら、process がこの実行で
 * `done` にしたスロット（PROCESSED_SLOTS）だけを `failed`（理由付き）へ確実に差し戻す。
 * 成功時は何もしない。これにより CMS の /scheduled-publish・ダッシュボードで失敗が可視化され、
 * リトライ導線に乗せられる。
 *
 * 環境変数:
 *   DEPLOY_RESULT    GitHub Actions の deploy ジョブ result（success / failure / cancelled / skipped）
 *   PROCESSED_SLOTS  process ジョブが出力した scheduledAt の JSON 配列
 *   RUN_URL          当該 Actions 実行の URL（失敗理由に添える・任意）
 *
 * git 操作はしない（呼び出し側のワークフローがコミットする）。
 *
 * @example
 *   DEPLOY_RESULT=failure PROCESSED_SLOTS='["2026-..."]' npx tsx scripts/finalize-schedule.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  finalizeScheduledSlots,
  SCHEDULE_QUEUE_PATH,
  DEFAULT_SCHEDULE_QUEUE,
  type ScheduleQueue,
} from '@c-time/frelio-content-ops'

function log(...args: unknown[]) {
  console.log('[finalize-schedule]', ...args)
}

function readQueue(): ScheduleQueue {
  if (!existsSync(SCHEDULE_QUEUE_PATH)) return DEFAULT_SCHEDULE_QUEUE
  try {
    const raw = JSON.parse(readFileSync(SCHEDULE_QUEUE_PATH, 'utf-8')) as ScheduleQueue
    return { slots: Array.isArray(raw?.slots) ? raw.slots : [] }
  } catch {
    return DEFAULT_SCHEDULE_QUEUE
  }
}

function parseProcessedKeys(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function buildErrorMessage(runUrl: string): string {
  const base =
    '本番化（デプロイ）に失敗しました。Cloudflare の一時的な障害の可能性があります。' +
    '時間をおいて「予約反映」から再実行してください。'
  return runUrl ? `${base}（詳細: ${runUrl}）` : base
}

function main() {
  const deployResult = (process.env.DEPLOY_RESULT ?? '').trim()
  const deployFailed = deployResult !== '' && deployResult !== 'success'
  const processedKeys = parseProcessedKeys(process.env.PROCESSED_SLOTS)
  const runUrl = (process.env.RUN_URL ?? '').trim()

  if (!deployFailed) {
    log(`deploy result="${deployResult}" → 差し戻し不要`)
    return
  }
  if (processedKeys.length === 0) {
    log('差し戻す対象スロットがありません（processed_slots 空）')
    return
  }

  const queue = readQueue()
  const { queue: next, changed } = finalizeScheduledSlots(queue, {
    processedKeys,
    deployFailed,
    errorMessage: buildErrorMessage(runUrl),
    now: new Date().toISOString(),
  })

  if (!changed) {
    log('該当する done スロットが無く、変更はありません')
    return
  }

  writeFileSync(SCHEDULE_QUEUE_PATH, JSON.stringify(next, null, 2) + '\n')
  const flipped = next.slots.filter((s) => s.status === 'failed' && processedKeys.includes(s.scheduledAt))
  log(`deploy result="${deployResult}" → ${flipped.length} 件のスロットを failed に差し戻しました`)
}

main()
