/**
 * コンテンツ変更監視スクリプト
 *
 * frelio-data/ 内のコンテンツ JSON の変更を検知し、
 * ビューインデックスとダッシュボードメタデータを自動更新する。
 *
 * @example
 * npx tsx scripts/watch-content.ts
 * npx tsx scripts/watch-content.ts --log-level debug
 */

import { watch, readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from 'fs'
import { dirname } from 'path'
import { parseArgs } from 'util'
import {
  computeViewIndexUpsert,
  computeViewIndexRemoval,
  computeDashboardMetadataOnSave,
  computeDashboardMetadataOnDelete,
  rebuildAllIndexes,
  SITE_CONTENTS,
  ADMIN_CONTENT_TYPES,
  type ContentStorePort,
  type ContentData,
  type FileChange,
  type BasePath,
} from '@c-time/frelio-content-ops'

const { values } = parseArgs({
  options: {
    'log-level': { type: 'string', default: 'info' },
    'debounce-ms': { type: 'string', default: '300' },
  },
})

const LOG_LEVEL = values['log-level'] as 'debug' | 'info' | 'quiet'
const DEBOUNCE_MS = Number(values['debounce-ms'])

function logDebug(...args: unknown[]) {
  if (LOG_LEVEL === 'debug') console.log('[debug]', ...args)
}
function logInfo(...args: unknown[]) {
  if (LOG_LEVEL !== 'quiet') console.log('[info]', ...args)
}

function createFsContentStore(): ContentStorePort {
  return {
    async readJson<T>(path: string): Promise<T | null> {
      if (!existsSync(path)) return null
      try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T
      } catch {
        return null
      }
    },
  }
}

type ContentChangeEvent = {
  kind: 'content-save' | 'content-delete'
  basePath: BasePath
  contentTypeId: string
  contentId: string
}

type ViewsChangeEvent = {
  kind: 'views-change'
  contentTypeId: string
}

type ChangeEvent = ContentChangeEvent | ViewsChangeEvent

function classifyChange(filePath: string): ChangeEvent | null {
  const normalized = filePath.replace(/\\\\/g, '/')
  const contentMatch = normalized.match(
    /^frelio-data\/site\/contents\/(published|private)\/([^/]+)\/([^/]+)\.json$/,
  )
  if (contentMatch) {
    const [, basePath, contentTypeId, fileName] = contentMatch
    if (fileName.startsWith('_')) return null
    const exists = existsSync(filePath)
    return {
      kind: exists ? 'content-save' : 'content-delete',
      basePath: basePath as BasePath,
      contentTypeId,
      contentId: fileName,
    }
  }
  const viewsMatch = normalized.match(
    /^frelio-data\/admin\/content_types\/([^/]+)\.views\.json$/,
  )
  if (viewsMatch) {
    return { kind: 'views-change', contentTypeId: viewsMatch[1] }
  }
  return null
}

function applyFileChanges(changes: FileChange[]) {
  for (const change of changes) {
    if (change.delete) {
      if (existsSync(change.path)) unlinkSync(change.path)
    } else {
      mkdirSync(dirname(change.path), { recursive: true })
      writeFileSync(change.path, change.content + '\n')
    }
  }
}

const store = createFsContentStore()
const suppressedPaths = new Set<string>()

function applyFileChangesWithSuppress(changes: FileChange[]) {
  for (const change of changes) {
    const normalized = change.path.replace(/\\\\/g, '/')
    suppressedPaths.add(normalized)
    setTimeout(() => suppressedPaths.delete(normalized), DEBOUNCE_MS + 200)
  }
  applyFileChanges(changes)
}

async function handleContentSave(event: ContentChangeEvent) {
  const { basePath, contentTypeId, contentId } = event
  const contentPath = `${SITE_CONTENTS}/${basePath}/${contentTypeId}/${contentId}.json`
  const content = await store.readJson<ContentData>(contentPath)
  if (!content) return

  const viewChanges = await computeViewIndexUpsert(store, { basePath, contentTypeId, content })
  const metaChange = await computeDashboardMetadataOnSave(store, {
    contentTypeId, updatedBy: content.updatedBy,
    oldStatus: null, newStatus: content.status,
  })
  applyFileChangesWithSuppress([...viewChanges, metaChange])
  logInfo(`Content saved: ${basePath}/${contentTypeId}/${contentId}`)
}

async function handleContentDelete(event: ContentChangeEvent) {
  const { basePath, contentTypeId, contentId } = event
  const viewChanges = await computeViewIndexRemoval(store, { basePath, contentTypeId, contentId })
  const metaChange = await computeDashboardMetadataOnDelete(store, {
    contentTypeId, deletedBy: 'unknown', deletedStatus: 'draft' as ContentData['status'],
  })
  applyFileChangesWithSuppress([...viewChanges, metaChange])
  logInfo(`Content deleted: ${basePath}/${contentTypeId}/${contentId}`)
}

async function handleViewsChange(event: ViewsChangeEvent) {
  const { contentTypeId } = event
  logInfo(`Views changed for: ${contentTypeId}, rebuilding indexes...`)
  const allContent: { basePath: BasePath; content: ContentData }[] = []
  for (const basePath of ['published', 'private'] as const) {
    const dir = `${SITE_CONTENTS}/${basePath}/${contentTypeId}`
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    for (const file of files) {
      const content = await store.readJson<ContentData>(`${dir}/${file}`)
      if (content) allContent.push({ basePath, content })
    }
  }
  const changes = await rebuildAllIndexes(store, { contentTypeId, allContent })
  applyFileChangesWithSuppress(changes)
  logInfo(`Rebuilt ${changes.length} index file(s) for ${contentTypeId}`)
}

const pending = new Map<string, NodeJS.Timeout>()
let processing = Promise.resolve()

function enqueue(fn: () => Promise<void>) {
  processing = processing.then(fn).catch((err) => console.error('Handler error:', err))
}

function scheduleHandler(filePath: string, handler: () => Promise<void>) {
  const existing = pending.get(filePath)
  if (existing) clearTimeout(existing)
  pending.set(filePath, setTimeout(() => {
    pending.delete(filePath)
    enqueue(handler)
  }, DEBOUNCE_MS))
}

async function main() {
  logInfo('Starting content watcher...')
  const watchTargets = [
    { path: SITE_CONTENTS, label: 'contents' },
    { path: ADMIN_CONTENT_TYPES, label: 'admin/content_types' },
  ]

  for (const target of watchTargets) {
    if (!existsSync(target.path)) {
      console.error(`Watch target not found: ${target.path}`)
      process.exit(1)
    }
    watch(target.path, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) return
      const fullPath = `${target.path}/${fileName.replace(/\\\\/g, '/')}`
      if (!fullPath.endsWith('.json')) return
      if (suppressedPaths.has(fullPath)) return
      const event = classifyChange(fullPath)
      if (!event) return
      scheduleHandler(fullPath, async () => {
        const latestEvent = classifyChange(fullPath)
        if (!latestEvent) return
        switch (latestEvent.kind) {
          case 'content-save': await handleContentSave(latestEvent); break
          case 'content-delete': await handleContentDelete(latestEvent); break
          case 'views-change': await handleViewsChange(latestEvent); break
        }
      })
    })
    logInfo(`Watching: ${target.path}`)
  }

  logInfo('Ready. Press Ctrl+C to stop.')
  process.on('SIGINT', () => {
    logInfo('\nShutting down...')
    for (const timer of pending.values()) clearTimeout(timer)
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
