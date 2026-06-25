/**
 * テンプレート焼き込み（bake）スクリプト（issue #168）
 *
 * 各ページテンプレを gentl で1パス処理し、`data-gen-include`（共通クローム）と
 * `data-gen-repeat`（実サンプルデータ）を解決した結果を **テンプレート自身へ書き戻す**。
 * 焼き込み後のテンプレはサーバー無し（file://）でもクローム＋実データが見えるプレビューになる。
 *
 * gentl 出力は `<template data-gen-*>` ソースを保持する（ブラウザでは不可視）ため、
 * 焼き込み済みテンプレを再ビルド・再 bake できる（冪等）。
 *
 * 前提: 先に `npm run generate`（data-json 生成）を実行しておくこと。
 *
 * @example
 * npx tsx scripts/bake-templates.ts                 # 焼き込み実行（latest 代表）
 * npx tsx scripts/bake-templates.ts --pick first     # 先頭コンテンツを代表に
 * npx tsx scripts/bake-templates.ts --dry-run        # 書き込まず結果のみ表示
 * npx tsx scripts/bake-templates.ts --check          # 冪等性検証（CI・差分で非0終了）
 *
 * 注意: 焼き込みテンプレは `/styles/...`・`/scripts/...` を絶対パス参照するため、
 * file:// 直開きでは CSS/JS は読み込まれない（構造＋クローム＋実データは見える・無スタイル）。
 */

import {
  bakeTemplates,
  NodeFileSystem,
  selectLatestRepresentative,
  selectFirstRepresentative,
  type GenerateHtmlOptions,
} from '@c-time/frelio-gentl'
import type { FrelioDataJson } from '@c-time/frelio-data-json'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { dirname, join, extname } from 'path'
import { parseArgs } from 'util'

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    pick: { type: 'string', default: 'latest' },
    'log-level': { type: 'string', default: 'info' },
  },
})

const options: GenerateHtmlOptions = {
  logLevel: values['log-level'] as 'debug' | 'info' | 'quiet',
}

const DATA_JSON_ROOT = 'frelio-data/site/data/data-json'
const TEMPLATE_ROOT = 'frelio-data/site/templates'
const REPORT_PATH = 'frelio-data/site/data/bake-report.json'

/** gentl（happy-dom）出力は DOCTYPE を含まないため、file:// 直開き用に再付与する */
function ensureDoctype(html: string): string {
  return /^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>\n${html}`
}

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
  if (!existsSync(TEMPLATE_ROOT)) {
    console.error(`Template directory not found: ${TEMPLATE_ROOT}`)
    process.exit(1)
  }
  if (!existsSync(DATA_JSON_ROOT)) {
    console.error(`Data JSON directory not found: ${DATA_JSON_ROOT}`)
    console.error('先に `npm run generate`（data-json 生成）を実行してください。')
    process.exit(1)
  }

  const jsonFiles = collectJsonFiles(DATA_JSON_ROOT)
  if (jsonFiles.length === 0) {
    console.log('No data JSON files found. 先に `npm run generate` を実行してください。')
    return
  }

  const dataJsons: FrelioDataJson[] = jsonFiles.map((filePath) => {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  })

  if (values.pick !== 'latest' && values.pick !== 'first') {
    console.error(`Invalid --pick value: "${values.pick}"（latest | first）`)
    process.exit(1)
  }
  const selectRepresentative =
    values.pick === 'first' ? selectFirstRepresentative : selectLatestRepresentative

  console.log(`Found ${dataJsons.length} data JSON files`)

  const result = await bakeTemplates({
    dataJsons,
    templateRootPath: TEMPLATE_ROOT,
    fileSystem: new NodeFileSystem(),
    options,
    selectRepresentative,
  })

  // 書き戻し / dry-run / check
  const drift: string[] = []
  let written = 0
  for (const output of result.outputs) {
    const fullPath = join(TEMPLATE_ROOT, output.templatePath)
    const baked = ensureDoctype(output.html)

    if (values.check) {
      const current = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : ''
      if (current !== baked) drift.push(output.templatePath)
      continue
    }
    if (values['dry-run']) continue

    // テンプレートは既存ファイル。ディレクトリは作らない（パス不一致＝設定ミスを検出）
    if (!existsSync(fullPath)) {
      console.error(`Template not found (skipped write): ${fullPath}`)
      continue
    }
    writeFileSync(fullPath, baked)
    written++
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(result.report, null, 2))

  const { stats } = result.report
  console.log(`\n=== Bake Summary (pick: ${values.pick}) ===`)
  for (const output of result.outputs) {
    console.log(`  ${output.templatePath}  ← 代表1件 / ${output.sourceCount}件`)
  }
  console.log(`Templates: ${result.outputs.length}`)
  console.log(`Errors: ${stats.errors}`)

  if (values.check) {
    if (drift.length > 0) {
      console.error(`\n❌ 焼き込みが最新ではありません（${drift.length}件のテンプレに差分）:`)
      for (const p of drift) console.error(`  - ${p}`)
      console.error('`npm run bake` を実行して差分をコミットしてください。')
      process.exit(1)
    }
    console.log('\n✅ 焼き込みは最新です（差分なし）。')
    return
  }

  if (values['dry-run']) {
    console.log('\n(dry-run: テンプレートへの書き戻しは行っていません)')
  } else {
    console.log(`\nWrote ${written} template(s).`)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
