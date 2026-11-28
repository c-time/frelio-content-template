/**
 * robots.txt 生成スクリプト（本番向け・issue #355）
 *
 * - サイト側の上書き: `frelio-data/site/templates/robots.txt` があれば、それをそのまま `public/robots.txt` にする
 *   （テンプレートの配置＝出力 URL の流儀。中身は自由に書ける）。
 * - 無ければ全クロール許可の robots.txt を生成し、`public/sitemap.xml` があれば
 *   `Sitemap: <productionUrl>/sitemap.xml` を付ける。
 *
 * 基準 URL の優先順: --base-url > 環境変数 SITE_BASE_URL > admin/config.json の productionUrl。
 * 本番向けのデプロイ（promote-production / _deploy）が sitemap 生成の後に自動で実行する。
 * staging プレビューには robots.txt を置かない（プレビューは X-Robots-Tag: noindex で検索から外す）。
 *
 * @example
 * npx tsx scripts/generate-robots.ts
 * npx tsx scripts/generate-robots.ts --base-url https://example.com
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'

const OVERRIDE_PATH = 'frelio-data/site/templates/robots.txt'
const OUTPUT_PATH = 'public/robots.txt'
const SITEMAP_PATH = 'public/sitemap.xml'
const CONFIG_PATH = 'admin/config.json'

/** admin/config.json の productionUrl を読む（無い・読めない・空なら空文字） */
export function readProductionUrl(configPath: string = CONFIG_PATH): string {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { productionUrl?: unknown }
    return typeof config.productionUrl === 'string' ? config.productionUrl.trim() : ''
  } catch {
    return ''
  }
}

/** 既定の robots.txt（全クロール許可＋sitemap の場所）。baseUrl が空なら Sitemap 行を付けない */
export function buildRobotsTxt(baseUrl: string, hasSitemap: boolean): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const lines = ['User-agent: *', 'Allow: /']
  if (base && hasSitemap) {
    lines.push('', `Sitemap: ${base}/sitemap.xml`)
  }
  return lines.join('\n') + '\n'
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  if (existsSync(OVERRIDE_PATH)) {
    if (!values['dry-run']) {
      mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
      copyFileSync(OVERRIDE_PATH, OUTPUT_PATH)
    }
    console.log(`robots.txt: ${OVERRIDE_PATH} をそのまま使います → ${OUTPUT_PATH}`)
    return
  }

  const baseUrl = values['base-url'] || process.env.SITE_BASE_URL || readProductionUrl()
  const txt = buildRobotsTxt(baseUrl, existsSync(SITEMAP_PATH))
  if (!values['dry-run']) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, txt)
  }
  console.log(`robots.txt: 生成しました → ${OUTPUT_PATH}`)
  console.log(txt)
}

// テストから import したときは実行しない（CLI として直接実行されたときだけ main）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
