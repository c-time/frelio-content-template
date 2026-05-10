/**
 * sitemap.xml 生成スクリプト
 *
 * public/ 配下の HTML ファイルを走査して sitemap.xml を生成する。
 *
 * @example
 * npx tsx scripts/generate-sitemap.ts --base-url https://example.com
 * npx tsx scripts/generate-sitemap.ts --full-rebuild --base-url https://example.com
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { parseArgs } from 'util'

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    'diff-range': { type: 'string', default: 'origin/main...HEAD' },
    'full-rebuild': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'log-level': { type: 'string', default: 'info' },
  },
})

const baseUrl = (values['base-url'] || process.env.SITE_BASE_URL || '').replace(/\/$/, '')
if (!baseUrl) {
  console.error('Error: --base-url or SITE_BASE_URL is required.')
  process.exit(1)
}

const logLevel = values['log-level'] as 'debug' | 'info' | 'quiet'

const HTML_ROOT = 'public'
const OUTPUT_PATH = 'public/sitemap.xml'

interface UrlEntry {
  loc: string
  lastmod: string | null
}

function htmlPathToUrlPath(htmlPath: string): string {
  const relative = htmlPath
    .replace(/\\\\/g, '/')
    .replace(/^public\//, '')
    .replace(/\/index\.html$/, '/')
  return relative === 'index.html' ? '/' : '/' + relative
}

function hasNoindex(htmlPath: string): boolean {
  const html = readFileSync(htmlPath, 'utf-8')
  return /<meta\s[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*>/i.test(html)
    || /<meta\s[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["'][^>]*>/i.test(html)
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

function collectHtmlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath))
    } else if (entry.name === 'index.html') {
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

function buildSitemapXml(entries: Map<string, UrlEntry>): string {
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

function createEntry(htmlPath: string): UrlEntry | null {
  if (hasNoindex(htmlPath)) return null
  return { loc: baseUrl + htmlPathToUrlPath(htmlPath), lastmod: getLastmod(htmlPath) }
}

function main(): void {
  if (logLevel !== 'quiet') {
    console.log(`Mode: ${values['full-rebuild'] ? 'full-rebuild' : 'incremental'}`)
    console.log(`Dry run: ${values['dry-run']}`)
  }

  const entries = new Map<string, UrlEntry>()
  const htmlFiles = collectHtmlFiles(HTML_ROOT)
  for (const htmlPath of htmlFiles) {
    const entry = createEntry(htmlPath)
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

main()
