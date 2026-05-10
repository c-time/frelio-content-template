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
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const RECIPE_PATH = 'frelio-data/admin/recipes/build-data-recipe.json'
const OUTPUT_PATH = 'frelio-data/site/data/_dependency-map.json'

const raw = JSON.parse(readFileSync(RECIPE_PATH, 'utf-8'))

const result = validateSiteRecipe(raw)
if (!result.success) {
  console.error('Invalid recipe:', formatZodErrors(result.errors))
  process.exit(1)
}

const recipe: FrelioBuildDataRecipe = result.data
const dependencyMap = convertRecipeToDependencyMap(recipe)

if (!isFrelioDependencyMap(dependencyMap)) {
  console.error('Generated dependency map is invalid')
  process.exit(1)
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, JSON.stringify(dependencyMap, null, 2))
console.log(`Dependency map written to ${OUTPUT_PATH}`)
