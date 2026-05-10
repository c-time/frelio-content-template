/**
 * HTML 生成スクリプト
 *
 * FrelioDataJson → HTML の変換（ビルドパイプライン Phase 2）
 *
 * @example
 * npx tsx scripts/generate-html.ts
 * npx tsx scripts/generate-html.ts --dry-run
 */

import {
  generateHtml,
  NodeFileSystem,
  type GenerateHtmlOptions,
} from '@c-time/frelio-gentl'
import type { FrelioDataJson } from '@c-time/frelio-data-json'
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from 'fs'
import { dirname, join, extname } from 'path'
import { parseArgs } from 'util'

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'log-level': { type: 'string', default: 'info' },
  },
})

const options: GenerateHtmlOptions = {
  logLevel: values['log-level'] as 'debug' | 'info' | 'quiet',
}

const DATA_JSON_ROOT = 'frelio-data/site/data/data-json'
const TEMPLATE_ROOT = 'frelio-data/site/templates'
const OUTPUT_ROOT = 'public'
const REPORT_PATH = 'frelio-data/site/data/html-report.json'

function collectJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath))
    } else if (extname(entry.name) === '.json') {
      files.push(fullPath)
    }
  }
  return files
}

async function main(): Promise<void> {
  if (!existsSync(DATA_JSON_ROOT)) {
    console.error(`Data JSON directory not found: ${DATA_JSON_ROOT}`)
    process.exit(1)
  }
  if (!existsSync(TEMPLATE_ROOT)) {
    console.error(`Template directory not found: ${TEMPLATE_ROOT}`)
    process.exit(1)
  }

  const jsonFiles = collectJsonFiles(DATA_JSON_ROOT)
  if (jsonFiles.length === 0) {
    console.log('No data JSON files found. Nothing to generate.')
    return
  }

  const dataJsons: FrelioDataJson[] = jsonFiles.map(filePath => {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  })

  console.log(`Found ${dataJsons.length} data JSON files`)

  const result = await generateHtml({
    dataJsons,
    templateRootPath: TEMPLATE_ROOT,
    fileSystem: new NodeFileSystem(),
    options,
  })

  if (!values['dry-run']) {
    mkdirSync(OUTPUT_ROOT, { recursive: true })
    for (const output of result.outputs) {
      if (output.status === 'deleted') {
        const fullPath = join(OUTPUT_ROOT, output.outputPath)
        if (existsSync(fullPath)) unlinkSync(fullPath)
      }
    }
    for (const output of result.outputs) {
      if (output.status === 'created') {
        const fullPath = join(OUTPUT_ROOT, output.outputPath)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, output.html)
      }
    }
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(result.report, null, 2))

  const { stats } = result.report
  console.log(`\n=== Summary ===`)
  console.log(`Created: ${stats.created}`)
  console.log(`Deleted: ${stats.deleted}`)
  console.log(`Errors: ${stats.errors}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
