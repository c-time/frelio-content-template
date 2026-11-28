/**
 * sitemap.xml 生成スクリプト
 *
 * public/ 配下の HTML ファイル（ディレクトリの index.html と、ファイルベースの詳細 *.html）を
 * 走査して sitemap.xml を生成する。<meta name="robots" content="noindex"> のページは除外する。
 *
 * 基準 URL の優先順: --base-url > 環境変数 SITE_BASE_URL > admin/config.json の productionUrl。
 * 本番向けのデプロイ（promote-production / _deploy）が自動で実行する（staging プレビューでは生成しない）。
 *
 * @example
 * npx tsx scripts/generate-sitemap.ts                      # admin/config.json の productionUrl を使う
 * npx tsx scripts/generate-sitemap.ts --base-url https://example.com
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'

const HTML_ROOT = 'public'
const OUTPUT_PATH = 'public/sitemap.xml'
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

/** 基準 URL を決める（末尾スラッシュは落とす）。--base-url > SITE_BASE_URL > productionUrl */
export function resolveBaseUrl(cliValue: string | undefined, envValue: string | undefined, productionUrl: string): string {
  return (cliValue || envValue || productionUrl || '').trim().replace(/\/+$/, '')
}

interface UrlEntry {
  loc: string
  lastmod: string | null
}

export function htmlPathToUrlPath(htmlPath: string): string {
  const relative = htmlPath
    .replace(/\\/g, '/')
    .replace(/^public\//, '')
    .replace(/\/index\.html$/, '/')
  return relative === 'index.html' ? '/' : '/' + relative
}

export function hasNoindexMeta(html: string): boolean {
  return /<meta\s[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*>/i.test(html)
    || /<meta\s[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["'][^>]*>/i.test(html)
}

function hasNoindex(htmlPath: string): boolean {
  return hasNoindexMeta(readFileSync(htmlPath, 'utf-8'))
}

function getLastmod(filePath: string): string | null {
  try {
    const result = execSync(`git log -1 --format=%aI -- "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result || null
  } catch {
    return null
  }
}

/** ディレクトリの index.html とファイルベースの詳細（news/foo.html 等）の *.html をすべて集める */
export function collectHtmlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath))
    } else if (entry.name.endsWith('.html')) {
      files.push(fullPath)
    }
  }
  return files
}

function parseSitemap(xml: string): Map<string, UrlEntry> {
  const entries = new Map<string, UrlEntry>()
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g
  const locRe = /<loc>([\s\S]*?)<\/loc>/
  const lastmodRe = /<lastmod>([\s\S]*?)<\/lastmod>/
  let match: RegExpExecArray | null
  while ((match = urlBlockRe.exec(xml)) !== null) {
    const block = match[1]
    const locMatch = locRe.exec(block)
    if (!locMatch) continue
    const loc = locMatch[1].trim()
    const lastmodMatch = lastmodRe.exec(block)
    entries.set(loc, { loc, lastmod: lastmodMatch ? lastmodMatch[1].trim() : null })
  }
  return entries
}

export function buildSitemapXml(entries: Map<string, UrlEntry>): string {
  const sorted = [...entries.values()].sort((a, b) => a.loc.localeCompare(b.loc))
  const urlElements = sorted.map((entry) => {
    const lastmodLine = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
    return `  <url>\n    <loc>${entry.loc}</loc>${lastmodLine}\n  </url>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlElements,
    '</urlset>',
    '',
  ].join('\n')
}

function createEntry(baseUrl: string, htmlPath: string): UrlEntry | null {
  if (hasNoindex(htmlPath)) return null
  return { loc: baseUrl + htmlPathToUrlPath(htmlPath), lastmod: getLastmod(htmlPath) }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'diff-range': { type: 'string', default: 'origin/main...HEAD' },
      'full-rebuild': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'log-level': { type: 'string', default: 'info' },
    },
  })

  const baseUrl = resolveBaseUrl(values['base-url'], process.env.SITE_BASE_URL, readProductionUrl())
  if (!baseUrl) {
    console.error(`Error: 基準 URL がありません。--base-url / SITE_BASE_URL を指定するか、${CONFIG_PATH} の productionUrl を設定してください。`)
    process.exit(1)
  }

  const logLevel = values['log-level'] as 'debug' | 'info' | 'quiet'

  if (logLevel !== 'quiet') {
    console.log(`Base URL: ${baseUrl}`)
    console.log(`Mode: ${values['full-rebuild'] ? 'full-rebuild' : 'incremental'}`)
    console.log(`Dry run: ${values['dry-run']}`)
  }

  const entries = new Map<string, UrlEntry>()
  const htmlFiles = collectHtmlFiles(HTML_ROOT)
  for (const htmlPath of htmlFiles) {
    const entry = createEntry(baseUrl, htmlPath)
    if (entry) entries.set(entry.loc, entry)
  }

  const xml = buildSitemapXml(entries)

  if (!values['dry-run']) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, xml)
  }

  if (logLevel !== 'quiet') {
    console.log(`Total URLs: ${entries.size}`)
    console.log(`Output: ${OUTPUT_PATH}`)
  }
}

// テストから import したときは実行しない（CLI として直接実行されたときだけ main）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
