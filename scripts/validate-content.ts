/**
 * コンテンツ画像参照の検証スクリプト
 *
 * AI / 人が繰り返しやすい「画像を R2 に登録し忘れる」「テンプレートの静的フォールバック
 * （/images/placeholder.jpg 等）をそのまま残す」ミスを、コンテンツ保存後に機械的に検出する。
 *
 * 検査対象:
 *   - image / file フィールドの値（url・variants）が R2 の生キー形式か
 *   - html フィールド本文の <img src="..."> が /storage/... の最終URL（R2登録済み）か
 *
 * R2 生キーの形（コンテンツにはこの形で保存する。/storage/ はレシピの customField が前置する）:
 *   2026/<uuid>/medium.webp
 *
 * ERROR が1件でもあれば非0終了（`npm run check` で CI 的に使える）。WARN のみなら 0 終了。
 *
 * @example
 * npx tsx scripts/validate-content.ts
 * npx tsx scripts/validate-content.ts --log-level quiet
 *
 * 注: R2 に実在するかの存在確認（storage /list API 照合）はネットワーク・PAT が要るため本スクリプトの
 * スコープ外。形式ベースの検出で「プレースホルダ流用・ローカルパス・未登録疑い」は十分に捕捉できる。
 * 将来 `--verify-r2`（要 FRELIO_PAT）として拡張余地あり。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { parseArgs } from 'util'
import type { Content, ContentType, FieldDefinition } from '@c-time/frelio-types'

const { values } = parseArgs({
  options: {
    'log-level': { type: 'string', default: 'info' },
  },
})

const LOG_LEVEL = values['log-level'] as 'debug' | 'info' | 'quiet'

const CONTENT_TYPES_DIR = 'frelio-data/site/content_types'
const CONTENTS_DIRS = [
  'frelio-data/site/contents/published',
  'frelio-data/site/contents/private',
]

/** R2 生キーの形: <year>/<uuid>/<name>.<ext>（先頭スラッシュなし） */
const R2_KEY_RE = /^\d{4}\/[^/\s]+\/[^/\s]+\.[^/\s]+$/
/** ローカルテンプレート／リポジトリ内パスを指す疑い */
const LOCAL_PATH_RE = /(^|\/)(frelio-data|templates|public|images|assets)(\/|$)/i

type Finding = { level: 'error' | 'warn'; file: string; field: string; detail: string }

const findings: Finding[] = []

function addFinding(level: Finding['level'], file: string, field: string, detail: string) {
  findings.push({ level, file, field, detail })
}

/** image / file フィールド値から url 文字列を収集（url + variants）。 */
function collectStorageUrls(value: unknown): string[] {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.flatMap(collectStorageUrls)
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const urls: string[] = []
    if (typeof obj.url === 'string' && obj.url !== '') urls.push(obj.url)
    if (obj.variants && typeof obj.variants === 'object') {
      for (const v of Object.values(obj.variants as Record<string, unknown>)) {
        if (typeof v === 'string' && v !== '') urls.push(v)
      }
    }
    return urls
  }
  return []
}

/** R2 生キーとして妥当か判定し、問題があれば finding を積む。 */
function checkStorageUrl(url: string, file: string, field: string) {
  if (/^https?:\/\//i.test(url)) {
    addFinding('warn', file, field, `外部URLを参照している（R2 化推奨）: ${url}`)
    return
  }
  if (url.includes('placeholder')) {
    addFinding('error', file, field, `プレースホルダ画像を参照している（R2 に実画像を登録すること）: ${url}`)
    return
  }
  if (url.startsWith('/')) {
    addFinding('error', file, field, `先頭スラッシュ付きパス（コンテンツには R2 生キーを入れる。/storage/ は付けない）: ${url}`)
    return
  }
  if (LOCAL_PATH_RE.test(url)) {
    addFinding('error', file, field, `ローカル/テンプレートのパスを参照している（R2 未登録の疑い）: ${url}`)
    return
  }
  if (!url.includes('/')) {
    addFinding('error', file, field, `裸のファイル名（R2 未登録の疑い。生キーは <年>/<uuid>/<name>.<ext>）: ${url}`)
    return
  }
  if (!R2_KEY_RE.test(url)) {
    addFinding('error', file, field, `R2 生キー形式ではない（<年>/<uuid>/<name>.<ext> を想定）: ${url}`)
  }
}

/** html 本文の <img src="..."> を抽出して検査する。 */
function checkHtmlField(html: string, file: string, field: string) {
  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    const src = m[1].trim()
    if (src === '' || src.startsWith('data:') || src.startsWith('/storage/')) continue
    if (/^https?:\/\//i.test(src)) {
      addFinding('warn', file, `${field}(img)`, `本文の外部画像（R2 化推奨）: ${src}`)
      continue
    }
    if (src.includes('placeholder')) {
      addFinding('error', file, `${field}(img)`, `本文にプレースホルダ画像（R2 の実画像へ差し替えること）: ${src}`)
      continue
    }
    addFinding('error', file, `${field}(img)`, `本文の画像が /storage/ の実URLでない（R2 登録済み画像を使うこと）: ${src}`)
  }
}

/** content_types を読み、image/file/html フィールドのキーを type ごとに把握する。 */
function loadFieldMap(): Record<string, { image: string[]; file: string[]; html: string[] }> {
  const map: Record<string, { image: string[]; file: string[]; html: string[] }> = {}
  if (!existsSync(CONTENT_TYPES_DIR)) return map
  for (const name of readdirSync(CONTENT_TYPES_DIR)) {
    if (!name.endsWith('.json')) continue
    const ct = JSON.parse(readFileSync(join(CONTENT_TYPES_DIR, name), 'utf-8')) as ContentType
    const keys = { image: [] as string[], file: [] as string[], html: [] as string[] }
    for (const f of ct.fields ?? ([] as FieldDefinition[])) {
      if (f.type === 'image') keys.image.push(f.key)
      else if (f.type === 'file') keys.file.push(f.key)
      else if (f.type === 'html') keys.html.push(f.key)
    }
    map[ct.id] = keys
  }
  return map
}

/** ディレクトリ配下の *.json を再帰収集する。 */
function collectJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectJsonFiles(p))
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

function main() {
  const fieldMap = loadFieldMap()

  const contentFiles = CONTENTS_DIRS.flatMap(collectJsonFiles)
  let checked = 0

  for (const file of contentFiles) {
    let content: Content
    try {
      content = JSON.parse(readFileSync(file, 'utf-8')) as Content
    } catch {
      addFinding('error', file, '(json)', 'JSON として読み込めない')
      continue
    }
    const keys = fieldMap[content.contentTypeId]
    if (!keys) continue // スキーマ未知の型はスキップ（別途 rebuild で検出される想定）
    checked++

    for (const key of [...keys.image, ...keys.file]) {
      for (const url of collectStorageUrls(content.data?.[key])) {
        checkStorageUrl(url, file, key)
      }
    }
    for (const key of keys.html) {
      const v = content.data?.[key]
      if (typeof v === 'string') checkHtmlField(v, file, key)
    }
  }

  const errors = findings.filter((f) => f.level === 'error')
  const warns = findings.filter((f) => f.level === 'warn')

  if (LOG_LEVEL !== 'quiet') {
    for (const f of findings) {
      const tag = f.level === 'error' ? '[ERROR]' : '[warn] '
      console.log(`${tag} ${f.file} : ${f.field} : ${f.detail}`)
    }
    console.log(
      `\n検査コンテンツ ${checked} 件 / ERROR ${errors.length} 件 / WARN ${warns.length} 件`,
    )
  }

  if (errors.length > 0) {
    if (LOG_LEVEL !== 'quiet') {
      console.error(
        '\n画像参照に問題があります。画像は先に R2 へ登録し、image フィールドには生キー（<年>/<uuid>/<name>.webp）を設定してください。',
      )
    }
    process.exit(1)
  }
}

main()
