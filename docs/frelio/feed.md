# RSS / Atom フィード（list レシピの `feed`）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

お知らせ・ブログの一覧（`list` レシピ）に `feed` を書くと、ビルド時に RSS 2.0 / Atom 1.0 のフィード
（XML）を `public/` へ出力する。テンプレートは不要（XML は生成器が直接組み立てる）。

## 書き方

`admin/recipes/build-data-recipe.json` の list レシピに足す（雛形のお知らせ一覧に実例あり）。

```json
{
  "type": "list",
  "outputPath": "news/page/{$page}.json",
  "templatePath": "news/index.html",
  "sort": [{ "field": "publishDate", "direction": "desc" }],
  "pagination": { "perPage": 10, "numberFormatCount": 1, "startPath": "news/index.json" },
  "feed": {
    "format": "rss",
    "outputPath": "news/feed.xml",
    "limit": 20,
    "title": "お知らせ | {$site.title}",
    "description": "{$site.title} からのお知らせ",
    "item": {
      "title": "{$this.title}",
      "link": "/news/{$this.slug}/",
      "date": "publishDate",
      "summary": "{$this.excerpt}"
    }
  }
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `format` | ○ | `"rss"`（RSS 2.0）または `"atom"`（Atom 1.0） |
| `outputPath` | ○ | 出力先（`public/` からの相対）。`.xml` で終える（`npm run validate:schema` が警告） |
| `limit` | | 載せる件数（既定 20） |
| `title` | ○ | フィードのタイトル。`{$site.title}` 等を使える |
| `description` | | フィードの説明（省略時はタイトル） |
| `item.title` | ○ | 各記事のタイトルの式（`{$this.xxx}` / `{$site.xxx}`） |
| `item.link` | ○ | 各記事のサイト内パスの式。**詳細レシピの outputPath と URL を一致させる**（`news/{$this.slug}/index.json` → `/news/{$this.slug}/`） |
| `item.date` | ○ | 日時に使うフィールドのキー（`publishDate` など。`publishedAt` 等のシステム項目も可） |
| `item.summary` | | 概要の式 |

- **RSS と Atom の両方**を出すときは `feed` を配列にする: `"feed": [{ "format": "rss", ... }, { "format": "atom", "outputPath": "news/atom.xml", ... }]`
- 載る記事は、その list と**同じ `filters` / `sort`** を適用した結果の**先頭 `limit` 件**（ページ分割・list の `offset` / `limit` とは無関係）。
- `{$this.xxx}` は記事の値（**customFields 適用前**の素の値）。customField で整形した値（`YYYY-MM-DD` の日付など）は使えない。
- 値は XML エスケープされる（HTML を入れるとタグが文字として載る）。日付の整形は不要（自動で RSS は RFC 822、Atom は RFC 3339）。

## URL と日時

- **絶対 URL のベースは `admin/config.json` の `productionUrl`**（`{$site.url}` と同じ値・CMS の「基本設定」の本番 URL）。
  `item.link` のサイト内パスに前置して絶対 URL にし、RSS の `guid` / Atom の `id` にも使う。
- **`productionUrl` が未設定だとフィードを生成しない**（相対 URL のフィードは不正なため。ビルドの警告 `FEED_NOT_GENERATED`）。
  以前のビルドで出したフィードがあれば削除する。
- 日時の表記はレシピの `outputTimezone`（無ければ UTC）。`date` 型（暦日）はそのタイムゾーンの 0 時として扱う。
  日時が空・不正な記事はフィードから外す（警告 `FEED_ITEM_SKIPPED`）。
- フィードの更新日時（RSS の `lastBuildDate`・Atom の `updated`）は**最新の記事の日時**（ビルド時刻ではない）。
  内容が変わらなければ出力も変わらない。
- 記事が 0 件のとき: RSS は記事の無いフィードを出す。Atom は `updated` が必須のため生成しない（警告）。

## ページの head にフィードを知らせる

一覧・記事詳細の `<head>` に自動検出のリンクを置く（雛形の `news/index.html` / `news/_detail/index.html` に実例）。

```html
<link rel="alternate" type="application/rss+xml" title="お知らせ" href="/news/feed.xml">
<!-- Atom なら type="application/atom+xml" -->
```

全ページに出したいなら `_parts/head.htm` に置いてよい（変えたら `npm run bake`。`docs/frelio/template-bake.md`）。

## ビルドとの関係

- 生成は `npm run generate`（CI では `npx frelio-data-json-generator`）。data-json を経由せず `public/` へ直接書く。
- 差分ビルドでは、その list が再生成されるとき（記事の追加・変更・削除など）だけ作り直す。
  レシピに `feed` を足した直後や `productionUrl` を変えた後は、全生成（`npm run generate:full` / Actions の全生成）で反映する
  （差分ビルドはレシピ・`admin/config.json` の変更を検知しない）。
- `feed` をレシピから消しても、出力済みの XML は全生成まで残る。
- `sitemap.xml` には載らない（sitemap は HTML だけが対象）。
- 管理画面のレシピ編集（フォーム）には `feed` の項目が無い。JSON 編集で書く（フォームで保存しても `feed` は消えない）。
- 管理画面のプレビューはフィードを作らない。
