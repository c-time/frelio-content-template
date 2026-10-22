/**
 * テンプレートのデータ束縛（data-gen-text / data-gen-html）の検証スクリプト
 *
 * AI / 人が繰り返しやすい「html フィールドを data-gen-text（エスケープ出力）で束縛してしまう」
 * ミスを機械的に検出する。
 *
 * なぜ問題か:
 *   ビジュアルエディタ（TipTap）は本文の段落を必ず <p>…</p> で包んで保存する（正しい HTML 出力）。
 *   これをテンプレートで data-gen-html（生出力）ではなく data-gen-text（HTML エスケープ）で書き出すと、
 *   <p> がエスケープされて `<p>…</p>` という生タグが**文字として**公開ページに露出する。
 *   → 属性を data-gen-html に直すのが修正（フィールドの型は変えない）。
 *
 * 判定:
 *   - ERROR: html 型フィールドを data-gen-text で束縛（＝上記の露出バグ）
 *   - WARN : text 系フィールド（text/markdown/number/date/datetime/select）を data-gen-html で束縛
 *            （プレーン値を生出力＝通常は意図しない・軽微）
 *   - 無視 : どのコンテンツタイプにも無いキー（customField の href/eyecatchSrc、navigation の
 *            prev/next 配下、ループ変数のルート等）は照合しない＝誤検知しない。
 *
 * ERROR が1件でもあれば非0終了（`npm run check` で CI 的に使える）。WARN のみなら 0 終了。
 *
 * @example
 * npx tsx scripts/validate-templates.ts
 * npx tsx scripts/validate-templates.ts --log-level quiet
 *
 * 注（精度）: 照合は「全コンテンツタイプをまたいだフィールドキー名」で行うヒューリスティック。
 * TipTap は必ず <p> で包むため html フィールドを data-gen-text で出すのは実質つねに誤りで、この単純判定で
 * 十分に捕捉できる。同名キーが型違いで併存する場合は誤 ERROR を避けるため WARN に落とす。将来精度を上げるなら
 * レシピ（admin/recipes/build-data-recipe.json）の templatePath → コンテンツタイプ対応でキー照合を絞る。
 *
 * 注（bake 済みテンプレ）: 焼き込み済みテンプレは data-gen-cloned の描画クローンにも同じ属性が付くため、
 * 同一の指摘が「<template> ソース」と「クローン」で二重に出ることがある（検出漏れではない）。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, relative } from 'path'
import { parseArgs } from 'util'
import type { ContentType, FieldDefinition } from '@c-time/frelio-types'

const { values } = parseArgs({
  options: {
    'log-level': { type: 'string', default: 'info' },
  },
})

const LOG_LEVEL = values['log-level'] as 'debug' | 'info' | 'quiet'

const CONTENT_TYPES_DIR = 'frelio-data/site/content_types'
const TEMPLATE_ROOT = 'frelio-data/site/templates'

/** data-gen-html（生出力）が正しい型。 */
const HTML_TYPE = 'html'
/** data-gen-text（エスケープ出力）が正しいプレーン系の型。 */
const TEXT_LIKE_TYPES = new Set(['text', 'markdown', 'number', 'date', 'datetime', 'select'])

/** data-gen-text / data-gen-html の束縛を拾う。単一・二重引用符どちらも許容。 */
const BINDING_RE = /data-gen-(text|html)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

type Finding = { level: 'error' | 'warn'; file: string; line: number; detail: string }

const findings: Finding[] = []

function addFinding(level: Finding['level'], file: string, line: number, detail: string) {
  findings.push({ level, file, line, detail })
}

/** content_types を読み、フィールドキー → そのキーを定義する型の一覧（html / text 系）を集める。 */
function loadFieldTypeMap(): {
  htmlKeyToTypes: Map<string, string[]>
  textKeyToTypes: Map<string, string[]>
} {
  const htmlKeyToTypes = new Map<string, string[]>()
  const textKeyToTypes = new Map<string, string[]>()
  if (!existsSync(CONTENT_TYPES_DIR)) return { htmlKeyToTypes, textKeyToTypes }

  for (const name of readdirSync(CONTENT_TYPES_DIR)) {
    if (!name.endsWith('.json')) continue
    const ct = JSON.parse(readFileSync(join(CONTENT_TYPES_DIR, name), 'utf-8')) as ContentType
    for (const f of ct.fields ?? ([] as FieldDefinition[])) {
      if (f.type === HTML_TYPE) {
        htmlKeyToTypes.set(f.key, [...(htmlKeyToTypes.get(f.key) ?? []), ct.id])
      } else if (TEXT_LIKE_TYPES.has(f.type)) {
        textKeyToTypes.set(f.key, [...(textKeyToTypes.get(f.key) ?? []), ct.id])
      }
    }
  }
  return { htmlKeyToTypes, textKeyToTypes }
}

/** ディレクトリ配下の *.html / *.htm を再帰収集する。 */
function collectTemplateFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectTemplateFiles(p))
    else if (name.endsWith('.html') || name.endsWith('.htm')) out.push(p)
  }
  return out
}

/** 文字列先頭から index までの行番号（1 始まり）を返す。 */
function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** 束縛パスのリーフキー（ドット区切りの末尾）を返す。`item.note` → `note`。 */
function leafKey(path: string): string {
  const parts = path.split('.')
  return (parts[parts.length - 1] ?? '').trim()
}

function checkTemplate(
  file: string,
  html: string,
  maps: ReturnType<typeof loadFieldTypeMap>,
) {
  const { htmlKeyToTypes, textKeyToTypes } = maps
  let m: RegExpExecArray | null
  BINDING_RE.lastIndex = 0
  while ((m = BINDING_RE.exec(html)) !== null) {
    const attr = m[1] as 'text' | 'html' // data-gen-<attr>
    const path = (m[2] ?? m[3] ?? '').trim()
    const key = leafKey(path)
    if (key === '') continue

    const htmlTypes = htmlKeyToTypes.get(key)
    const textTypes = textKeyToTypes.get(key)
    const line = lineOf(html, m.index)

    if (attr === 'text' && htmlTypes) {
      // html フィールドをエスケープ出力している＝生タグ露出バグ。
      if (textTypes) {
        // 同名キーが型違いで併存。誤 ERROR を避けて WARN に落とす。
        addFinding(
          'warn',
          file,
          line,
          `"${key}" は html 型（${htmlTypes.join('/')}）と text 系（${textTypes.join('/')}）に併存。` +
            `このテンプレートの束縛先が html なら data-gen-html にすること（data-gen-text は <p> を露出させる）`,
        )
      } else {
        addFinding(
          'error',
          file,
          line,
          `html 型フィールド "${key}"（${htmlTypes.join('/')}）を data-gen-text で束縛している。` +
            `<p> 等のタグが文字として露出する。data-gen-html（生出力）を使うこと`,
        )
      }
    } else if (attr === 'html' && textTypes && !htmlTypes) {
      // プレーン値を生出力している。通常は意図しない（軽微）。
      addFinding(
        'warn',
        file,
        line,
        `text 系フィールド "${key}"（${textTypes.join('/')}）を data-gen-html で束縛している。` +
          `プレーン値を生出力している。通常は data-gen-text（エスケープ出力）を使う`,
      )
    }
  }
}

function main() {
  const maps = loadFieldTypeMap()

  const templateFiles = collectTemplateFiles(TEMPLATE_ROOT)
  let checked = 0

  for (const file of templateFiles) {
    let html: string
    try {
      html = readFileSync(file, 'utf-8')
    } catch {
      addFinding('error', relative('.', file), 1, 'テンプレートを読み込めない')
      continue
    }
    checked++
    checkTemplate(relative('.', file), html, maps)
  }

  const errors = findings.filter((f) => f.level === 'error')
  const warns = findings.filter((f) => f.level === 'warn')

  if (LOG_LEVEL !== 'quiet') {
    // ファイル → 行 の順で見やすく並べる。
    const sorted = [...findings].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    )
    for (const f of sorted) {
      const tag = f.level === 'error' ? '[ERROR]' : '[warn] '
      console.log(`${tag} ${f.file}:${f.line} : ${f.detail}`)
    }
    console.log(
      `\n検査テンプレート ${checked} 件 / ERROR ${errors.length} 件 / WARN ${warns.length} 件`,
    )
  }

  if (errors.length > 0) {
    if (LOG_LEVEL !== 'quiet') {
      console.error(
        '\nテンプレートのデータ束縛に問題があります。html フィールドの本文は data-gen-html（生出力）で' +
          '出力してください（data-gen-text はエスケープするため <p> 等のタグが文字として露出します）。',
      )
    }
    process.exit(1)
  }
}

main()
