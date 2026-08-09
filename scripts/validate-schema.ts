/**
 * JSON 構造（スキーマ）の検証スクリプト
 *
 * コンテンツタイプ定義・UI 設定・ビュー定義・ビルドレシピ・コンテンツ本体の各 JSON が、
 * `@c-time/frelio-types` の型（Zod スキーマ / 型ガード）に対して構造的に妥当かを検査する。
 *
 * これは「今この瞬間にデータが型として正しいか」の二値チェック（編集フェーズの検証）であり、
 * 生成物の追従状況を診る `frelio doctor`（保守フェーズ）とは責務が異なる。
 *
 * 検査対象と使うバリデーター:
 *   frelio-data/site/content_types/{id}.json        → validateContentType
 *   frelio-data/admin/content_types/{id}.ui.json    → validateContentTypeUi
 *   frelio-data/admin/content_types/{id}.views.json → validateContentTypeViews
 *   frelio-data/admin/recipes/build-data-recipe.json → validateSiteRecipe
 *   frelio-data/site/contents/{published,private}/**\/*.json → isContent（型ガード）
 *
 * ERROR が1件でもあれば非0終了（`npm run validate` / CI で使える）。WARN のみなら 0 終了。
 *
 * @example
 * npx tsx scripts/validate-schema.ts
 * npx tsx scripts/validate-schema.ts --log-level quiet
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { parseArgs } from 'util'
import {
  validateContentType,
  validateContentTypeUi,
  validateContentTypeViews,
  validateSiteRecipe,
  formatZodErrors,
} from '@c-time/frelio-types/schemas'
import { isContent } from '@c-time/frelio-types/guards'

const { values } = parseArgs({
  options: {
    'log-level': { type: 'string', default: 'info' },
  },
})

const LOG_LEVEL = values['log-level'] as 'debug' | 'info' | 'quiet'

const SITE_CONTENT_TYPES_DIR = 'frelio-data/site/content_types'
const ADMIN_CONTENT_TYPES_DIR = 'frelio-data/admin/content_types'
const RECIPE_PATH = 'frelio-data/admin/recipes/build-data-recipe.json'
const CONTENTS_DIRS = [
  'frelio-data/site/contents/published',
  'frelio-data/site/contents/private',
]

type Finding = { level: 'error' | 'warn'; file: string; detail: string }

const findings: Finding[] = []

function addFinding(level: Finding['level'], file: string, detail: string) {
  findings.push({ level, file, detail })
}

/** ファイルを JSON として読む。読めなければ finding を積んで null を返す。 */
function readJson(file: string): unknown | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    addFinding('error', file, 'JSON として読み込めない（構文エラー）')
    return null
  }
}

/** ディレクトリ直下の *.json を（サフィックス条件付きで）収集する。 */
function listJson(dir: string, filter: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && filter(name))
    .map((name) => join(dir, name))
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

let checked = 0

/** Zod バリデーターを1ファイルに適用し、失敗なら finding を積む。 */
function checkWithValidator(
  file: string,
  validate: (json: unknown) => { success: true } | { success: false; errors: Parameters<typeof formatZodErrors>[0] },
) {
  const json = readJson(file)
  if (json === null) return
  checked++
  const result = validate(json)
  if (!result.success) {
    addFinding('error', file, formatZodErrors(result.errors))
  }
}

function main() {
  // content_types/{id}.json（.ui.json / .views.json は除外）
  for (const file of listJson(
    SITE_CONTENT_TYPES_DIR,
    (name) => !name.endsWith('.ui.json') && !name.endsWith('.views.json'),
  )) {
    checkWithValidator(file, validateContentType)
  }

  // admin/content_types/{id}.ui.json
  for (const file of listJson(ADMIN_CONTENT_TYPES_DIR, (name) => name.endsWith('.ui.json'))) {
    checkWithValidator(file, validateContentTypeUi)
  }

  // admin/content_types/{id}.views.json
  for (const file of listJson(ADMIN_CONTENT_TYPES_DIR, (name) => name.endsWith('.views.json'))) {
    checkWithValidator(file, validateContentTypeViews)
  }

  // build-data-recipe.json
  if (existsSync(RECIPE_PATH)) {
    checkWithValidator(RECIPE_PATH, validateSiteRecipe)
  } else {
    addFinding('warn', RECIPE_PATH, 'ビルドレシピが見つからない（未作成）')
  }

  // 既知のコンテンツタイプ ID を集める（コンテンツの contentTypeId 照合用）
  const knownTypeIds = new Set(
    listJson(
      SITE_CONTENT_TYPES_DIR,
      (name) => !name.endsWith('.ui.json') && !name.endsWith('.views.json'),
    ).map((f) => f.replace(/^.*\//, '').replace(/\.json$/, '')),
  )

  // contents/{published,private}/**/*.json → isContent（型ガード）
  for (const file of CONTENTS_DIRS.flatMap(collectJsonFiles)) {
    const json = readJson(file)
    if (json === null) continue
    checked++
    if (!isContent(json)) {
      addFinding(
        'error',
        file,
        'Content の構造ではない（id / contentId / contentTypeId / status / data を確認）',
      )
      continue
    }
    if (!knownTypeIds.has(json.contentTypeId)) {
      addFinding(
        'warn',
        file,
        `contentTypeId "${json.contentTypeId}" に対応する content_types 定義が無い`,
      )
    }
  }

  const errors = findings.filter((f) => f.level === 'error')
  const warns = findings.filter((f) => f.level === 'warn')

  if (LOG_LEVEL !== 'quiet') {
    for (const f of findings) {
      const tag = f.level === 'error' ? '[ERROR]' : '[warn] '
      console.log(`${tag} ${f.file}\n         ${f.detail.replace(/\n/g, '\n         ')}`)
    }
    console.log(`\n検査 ${checked} ファイル / ERROR ${errors.length} 件 / WARN ${warns.length} 件`)
  }

  if (errors.length > 0) {
    if (LOG_LEVEL !== 'quiet') {
      console.error(
        '\nJSON の構造に問題があります。上記の型エラーを修正してください（型定義: @c-time/frelio-types）。',
      )
    }
    process.exit(1)
  }
}

main()
