/**
 * インデックス・ダッシュボードメタデータ一括再構築スクリプト
 *
 * @example
 * npx tsx scripts/rebuild-indexes.ts
 * npx tsx scripts/rebuild-indexes.ts --dry-run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { dirname } from 'path'
import { parseArgs } from 'util'
import {
  rebuildAllIndexes,
  calcMetadataOnSave,
  SITE_CONTENTS,
  CONTENT_TYPE_LIST_PATH,
  DASHBOARD_METADATA_PATH,
  type ContentStorePort,
  type ContentData,
  type FileChange,
  type BasePath,
} from '@c-time/frelio-content-ops'
import type { DashboardMetadata } from '@c-time/frelio-types'

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'log-level': { type: 'string', default: 'info' },
  },
})

const DRY_RUN = values['dry-run']!
const LOG_LEVEL = values['log-level'] as 'debug' | 'info' | 'quiet'

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

function applyFileChanges(changes: FileChange[]) {
  for (const change of changes) {
    mkdirSync(dirname(change.path), { recursive: true })
    writeFileSync(change.path, change.content + '\n')
  }
}

async function main() {
  const store = createFsContentStore()
  const listRaw = await store.readJson<{ contentTypes: { id: string }[] }>(CONTENT_TYPE_LIST_PATH)
  if (!listRaw) {
    console.error(`Content type list not found: ${CONTENT_TYPE_LIST_PATH}`)
    process.exit(1)
  }
  const contentTypeIds = listRaw.contentTypes.map((ct) => ct.id)
  logInfo(`Content types: ${contentTypeIds.join(', ')}`)

  const allChanges: FileChange[] = []
  let dashboardMetadata: DashboardMetadata = { contentTypes: {} }
  const now = new Date().toISOString()

  for (const contentTypeId of contentTypeIds) {
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
    logInfo(`${contentTypeId}: ${allContent.length} content(s) found`)
    const indexChanges = await rebuildAllIndexes(store, { contentTypeId, allContent })
    allChanges.push(...indexChanges)
    for (const { content } of allContent) {
      dashboardMetadata = calcMetadataOnSave(
        dashboardMetadata, contentTypeId, content.updatedBy,
        null, content.status, now,
      )
    }
  }

  allChanges.push({
    path: DASHBOARD_METADATA_PATH,
    content: JSON.stringify(dashboardMetadata, null, 2),
  })

  logInfo(`Files to write: ${allChanges.length}`)
  if (DRY_RUN) {
    logInfo('Dry run — no files written.')
    return
  }
  applyFileChanges(allChanges)
  logInfo(`Done. ${allChanges.length} file(s) written.`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
