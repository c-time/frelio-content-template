/**
 * FrelioDataJson 生成スクリプト
 *
 * FrelioBuildDataRecipe に従って FrelioDataJson を生成し、
 * frelio-data/site/data/data-json/ に出力する。
 *
 * @example
 * # 差分ビルド（デフォルト）
 * npx tsx scripts/generate-data-json.ts
 *
 * # フルリビルド
 * npx tsx scripts/generate-data-json.ts --full-rebuild
 *
 * # ドライラン
 * npx tsx scripts/generate-data-json.ts --dry-run
 */

import {
  generateDataJson,
  NodeFileSystem,
  getGitDiff,
  type GenerateDataJsonOptions,
} from '@c-time/frelio-data-json-generator'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { parseArgs } from 'util'

const { values } = parseArgs({
  options: {
    'diff-range': { type: 'string', default: 'origin/main...HEAD' },
    'full-rebuild': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'log-level': { type: 'string', default: 'info' },
  },
})

const options: GenerateDataJsonOptions = {
  fullRebuild: values['full-rebuild'],
  dryRun: values['dry-run'],
  logLevel: values['log-level'] as 'debug' | 'info' | 'quiet',
}

const CONTENT_ROOT = 'frelio-data/site'
const OUTPUT_ROOT = 'frelio-data/site/data/data-json'
const REPORT_PATH = 'frelio-data/site/data/report.json'
const RECIPE_PATH = 'frelio-data/admin/recipes/build-data-recipe.json'
const DEPENDENCY_MAP_PATH = 'frelio-data/site/data/_dependency-map.json'

async function main(): Promise<void> {
  if (!existsSync(RECIPE_PATH)) {
    console.error(`Recipe not found: ${RECIPE_PATH}`)
    process.exit(1)
  }
  const recipe = JSON.parse(readFileSync(RECIPE_PATH, 'utf-8'))

  if (!existsSync(DEPENDENCY_MAP_PATH)) {
    console.error(`Dependency map not found: ${DEPENDENCY_MAP_PATH}`)
    process.exit(1)
  }
  const dependencyMap = JSON.parse(readFileSync(DEPENDENCY_MAP_PATH, 'utf-8'))

  const gitDiff = options.fullRebuild
    ? { added: [], modified: [], deleted: [] }
    : await getGitDiff(values['diff-range']!)

  if (options.logLevel !== 'quiet') {
    console.log(`Mode: ${options.fullRebuild ? 'full-rebuild' : 'incremental'}`)
    console.log(`Dry run: ${options.dryRun}`)
  }

  const result = await generateDataJson({
    recipe,
    dependencyMap,
    gitDiff,
    fileSystem: new NodeFileSystem(),
    contentRootPath: CONTENT_ROOT,
    outputRootPath: OUTPUT_ROOT,
    options,
  })

  if (!options.dryRun) {
    mkdirSync(OUTPUT_ROOT, { recursive: true })
    // update も delete マーカー（type:'delete'）もディスクへ書き出す。
    // delete マーカーは次フェーズ（generate-html）が読み取って public の HTML を削除し、
    // マーカー自身も掃除する。ここで unlink するとシグナルが HTML フェーズに届かず、
    // detail の HTML 直 URL が孤児として残る（issue #212）。
    for (const output of result.outputs) {
      const fullPath = join(OUTPUT_ROOT, output.path)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, JSON.stringify(output.content, null, 2))
    }
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(result.report, null, 2))

  const { stats } = result.report
  console.log(`\n=== Summary ===`)
  console.log(`Updated: ${stats.updated}`)
  console.log(`Deleted: ${stats.deleted}`)
  console.log(`Skipped: ${stats.skipped}`)
  console.log(`Errors: ${stats.errors}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
