/**
 * 依存マップ生成スクリプト
 *
 * FrelioBuildDataRecipe から FrelioDependencyMap を生成する。
 *
 * @example
 * npx tsx scripts/generate-dependency-map.ts
 */

import { convertRecipeToDependencyMap } from '@c-time/frelio-data-json-recipe-to-dependency-map'
import { validateSiteRecipe, formatZodErrors } from '@c-time/frelio-types/schemas'
import { isFrelioDependencyMap } from '@c-time/frelio-dependency-map'
import type { FrelioBuildDataRecipe } from '@c-time/frelio-data-json-recipe'
import type { ContentType } from '@c-time/frelio-types'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { dirname, join } from 'path'

const RECIPE_PATH = 'frelio-data/admin/recipes/build-data-recipe.json'
const OUTPUT_PATH = 'frelio-data/site/data/_dependency-map.json'
const CONTENT_TYPES_DIR = 'frelio-data/site/content_types'

/**
 * ContentType 定義を読み込む。relation フィールドの参照先（expand で埋め込むコンテンツ）の変更を
 * 依存に含めるために convertRecipeToDependencyMap へ渡す（issue #368）。
 */
function loadContentTypeDefinitions(): Map<string, ContentType> {
  const definitions = new Map<string, ContentType>()
  if (!existsSync(CONTENT_TYPES_DIR)) return definitions
  for (const name of readdirSync(CONTENT_TYPES_DIR)) {
    if (!name.endsWith('.json')) continue
    try {
      const ct = JSON.parse(readFileSync(join(CONTENT_TYPES_DIR, name), 'utf-8')) as ContentType
      if (Array.isArray(ct?.fields)) definitions.set(ct.id ?? name.replace(/\.json$/, ''), ct)
    } catch {
      console.warn(`Skipped unreadable content type: ${name}`)
    }
  }
  return definitions
}

const raw = JSON.parse(readFileSync(RECIPE_PATH, 'utf-8'))

const result = validateSiteRecipe(raw)
if (!result.success) {
  console.error('Invalid recipe:', formatZodErrors(result.errors))
  process.exit(1)
}

const recipe: FrelioBuildDataRecipe = result.data
const dependencyMap = convertRecipeToDependencyMap(recipe, {
  contentTypeDefinitions: loadContentTypeDefinitions(),
})

if (!isFrelioDependencyMap(dependencyMap)) {
  console.error('Generated dependency map is invalid')
  process.exit(1)
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, JSON.stringify(dependencyMap, null, 2))
console.log(`Dependency map written to ${OUTPUT_PATH}`)
