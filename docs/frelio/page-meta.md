# ページごとの title / description / OGP / canonical の作り方

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

検索結果の説明文や SNS で共有したときのカード表示は、各ページの `<head>` に書く
`<title>` / `<meta name="description">` / OGP（`og:*`）/ `<link rel="canonical">` で決まる。
雛形には次の手本が入っている。

| ページ | 手本 | 作り方 |
|-------|------|-------|
| 記事詳細 | `news/_detail/index.html` | レシピの customField で記事ごとに組み立てる |
| 固定ページ | `index.html` / `about/index.html` | 文言は静的に書き、絶対 URL だけ customField で組み立てる |
| 一覧ページ | `news/index.html` / `faq/index.html` | 静的に書く（canonical / og:url は下記の制約を参照） |

## 前提: gentl はテンプレート内で文字列を連結できない

`data-gen-attrs="content:xxx"` は**データの値をそのまま**属性に入れるだけ。
「記事タイトル | サイト名」や「本番 URL + パス」はテンプレート側で作れないので、
**レシピ（`frelio-data/admin/recipes/build-data-recipe.json`）の customField で連結した値**をバインドする。

サイト名・本番 URL は `admin/config.json`（CMS の「基本設定」）の値を `{$site.title}` / `{$site.url}` で参照する
（`{$site.url}` は末尾スラッシュなし）。レシピにサイト名や URL を直書きしない。
テンプレートから `site.title` を直接使うときはレシピに `"include": { "site": true }` を付ける。
詳細は `docs/frelio/build-recipe.md` の「サイト設定を参照する」。

## 記事詳細（detail）

レシピ:

```json
{
  "type": "detail",
  "outputPath": "news/{$this.slug}/index.json",
  "templatePath": "news/_detail/index.html",
  "include": { "site": true },
  "customFields": [
    { "field": "pageTitle", "source": "{$this.title} | {$site.title}", "type": "string" },
    { "field": "metaDescription", "source": "{$this.excerpt}", "type": "truncate", "length": 120 },
    { "field": "canonicalUrl", "source": "{$site.url}/news/{$this.slug}/", "type": "string" },
    { "field": "ogImage", "source": "{$site.url}/storage/{$this.eyecatch.url}", "type": "string" }
  ]
}
```

テンプレート（`<head>` 内）:

```html
<template data-gen-scope="">
  <title data-gen-text="pageTitle">記事タイトル | サイト名</title>
  <link rel="canonical" data-gen-if="site.url" data-gen-attrs="href:canonicalUrl" href="https://example.com/news/slug/">
  <meta property="og:type" content="article">
  <meta property="og:title" data-gen-attrs="content:title" content="記事タイトル">
  <meta property="og:url" data-gen-if="site.url" data-gen-attrs="content:canonicalUrl" content="https://example.com/news/slug/">
  <meta property="og:site_name" data-gen-if="site.title" data-gen-attrs="content:site.title" content="サイト名">
  <meta name="twitter:card" content="summary_large_image">
</template>
<template data-gen-scope="" data-gen-if="metaDescription">
  <meta name="description" data-gen-attrs="content:metaDescription" content="記事の概要">
  <meta property="og:description" data-gen-attrs="content:metaDescription" content="記事の概要">
</template>
<template data-gen-scope="" data-gen-if="eyecatch">
  <meta property="og:image" data-gen-if="site.url" data-gen-attrs="content:ogImage" content="https://example.com/storage/eyecatch.webp">
</template>
```

- `canonicalUrl` のパスは detail レシピの `outputPath`（`news/{$this.slug}/index.json` → `/news/{slug}/`）と一致させる。
- description の元は概要フィールド（雛形は `excerpt`）。未入力なら `data-gen-if` でタグごと出さない。
  本文から作りたい場合は `"source": "{$this.body}", "type": "stripHtml"` の customField を先に置き、それを `truncate` する。
- `og:image` は**絶対 URL** が必要。画像は `/storage/` 配下で配信されるので `{$site.url}/storage/` を前置する。
- **本番 URL・サイト名が未設定のときはタグごと出さない。** `productionUrl` が空だと `{$site.url}` が空文字になり、
  canonical / og:url / og:image が `/news/slug/` のような相対 URL になる（canonical の相対 URL は誤り、og:image は
  絶対 URL でないと使われない）。そのため各タグに `data-gen-if="site.url"`（og:site_name は `data-gen-if="site.title"`）を
  付けている。`<template data-gen-scope>` の中の**要素**に付けた `data-gen-if` は効く（効かないのは入れ子の `<template>`）。
- `<title>` は gentl に否定条件が無くテンプレート側で区切りを出し分けられないため、`siteTitle` が空だと
  `記事タイトル | ` になる。**公開前に CMS の「基本設定」でサイト名（siteTitle）を設定すること。**
- **`data-gen-if` の `<template>` は入れ子にせず `<head>` 直下に並べる**（`<template data-gen-scope>` の直下に置いた
  `<template>` は描画されない）。
- 元の `<template>` 内の `content` / `href` は、素のブラウザで開いたときのダミー。実際の値は描画時に差し替わる。

## 固定ページ（static）

文言はページごとに決まっているので**静的に書く**。絶対 URL（canonical / og:url）とサイト名だけデータから入れる。

```json
{
  "type": "static",
  "outputPath": "about/index.json",
  "templatePath": "about/index.html",
  "include": { "site": true },
  "customFields": [{ "field": "canonicalUrl", "source": "{$site.url}/about/", "type": "string" }]
}
```

```html
<title>会社概要 | サイト名</title>
<meta name="description" content="会社概要のページです。">
<meta property="og:type" content="website">
<meta property="og:title" content="会社概要 | サイト名">
<meta property="og:description" content="会社概要のページです。">
<template data-gen-scope="">
  <link rel="canonical" data-gen-if="site.url" data-gen-attrs="href:canonicalUrl" href="https://example.com/about/">
  <meta property="og:url" data-gen-if="site.url" data-gen-attrs="content:canonicalUrl" content="https://example.com/about/">
  <meta property="og:site_name" data-gen-if="site.title" data-gen-attrs="content:site.title" content="サイト名">
</template>
```

固定ページの `<title>` もサイト名を config から取りたい場合は、customField
`{ "field": "pageTitle", "source": "会社概要 | {$site.title}", "type": "string" }` を足して
`<template data-gen-scope=""><title data-gen-text="pageTitle">…</title></template>` にする。

## 一覧ページ（list）

`description` / `og:title` などは静的に書く（`news/index.html` を参照）。

一覧レシピの `customFields` は**各アイテムに**適用されるもので、ページ全体の値（canonical 用の絶対 URL）は作れない。
一覧ページの canonical / og:url が必要なら、当面は本番 URL を静的に書く。

## 確認のしかた

- `npm run generate:full` → `npm run generate:html`（またはプレビュー）で出力 HTML の `<head>` を確認する。
- `admin/config.json` の `productionUrl` が空のあいだは canonical / og:url / og:image が出力されない（`frelio-cli init` の既定は空）。
  `siteTitle` が空だと og:site_name が出ず、記事の `<title>` が `記事タイトル | ` になる。どちらも公開前に「基本設定」で設定する。
- サイト名・本番 URL を変えたら全ページへ反映するためフルリビルド（`npm run generate:full`）する。
