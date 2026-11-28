# ビルドレシピと URL リプレーサー

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

**ファイルパス:** `frelio-data/admin/recipes/build-data-recipe.json`

コンテンツから出力ファイル（とその URL パス）をどう生成するかを定義する。
出力先 URL は `outputPath` で指定し、**リプレーサー（テンプレート変数）でコンテンツごとに動的に展開する**。

## レシピタイプ

| タイプ | 説明 | 用途 |
|-------|------|------|
| `detail` | 1コンテンツ = 1出力ファイル | 記事詳細ページ |
| `list` | 複数コンテンツ = 1つ以上の出力ファイル | 一覧・ページネーション |
| `static` | コンテンツに紐づかない固定出力 | トップページ等 |

## outputPath のリプレーサー（テンプレート変数）

| 変数 | 説明 | 例 |
|------|------|---|
| `{$this.slug}` | コンテンツの slug フィールド | `news/{$this.slug}.json` |
| `{$this.xxx}` | コンテンツの任意フィールド（ドット記法可） | `{$this.category}/{$this.slug}.json` |
| `{$page}` | ページ番号（ページネーション時） | `news/page/{$page}.json` |

## 必須ルール（重要）

- **`detail` レシピの `outputPath` には必ず `{$this.xxx}` リプレーサーを含める。**
  含めないと全コンテンツが同一ファイルに解決され衝突する（ビルド時に `MISSING_DETAIL_REPLACER` エラーになる）。
- リプレーサーに使えるのは **`useAsUrl: true` のフィールドのみ**（通常は `slug`）。コンテンツタイプ定義（`content_types/{id}.json`）で `useAsUrl` を設定する。
  違反は `npm run validate:schema` が WARN で知らせる（値を編集すると URL が変わるため）。
- **ページネーション付き `list` レシピの `outputPath` には `{$page}` を含める。**
  無いと 2 ページ目以降が同じパスに解決されて出力されない（ビルド時に `MISSING_PAGE_REPLACER` エラー・`validate:schema` も ERROR）。
  **1 ページ目だけ別のパス**（例: `news/index.json`）にしたいときは `pagination.startPath` を使う
  （`outputPath: "news/page/{$page}.json"` + `startPath: "news/index.json"` → `/news/`・`/news/page/2.html`・…）。
- **レシピに無いキーは黙って無視される（typo に注意）。** `npm run validate:schema` とビルド（generate:data）が、
  スキーマに無いキーを `[warn]`（キーのパスと近い名前の候補つき。例 `contentTypes.news.lists[0].fliters: 未知のキーです（もしかして: filters）`）で報告する。
  CI で失敗させたいときは `npm run validate:schema -- --strict` か環境変数 `FRELIO_STRICT_RECIPE_KEYS=1`（ビルドも失敗する）。
  管理画面のレシピ編集でも同じ警告を出す（JSON 編集から UI へ適用・保存すると未知キーは取り除かれる）。

## 例

```json
{
  "contentTypes": {
    "article": {
      "details": [
        { "type": "detail", "outputPath": "news/{$this.slug}/index.json", "templatePath": "news/_detail/index.html" }
      ],
      "lists": [
        {
          "type": "list",
          "outputPath": "news/page/{$page}.json",
          "templatePath": "news/index.html",
          "pagination": { "perPage": 10, "numberFormatCount": 1, "startPath": "news/index.json" }
        }
      ]
    }
  }
}
```

## フィルターの大小比較（日付で絞り込む）

`filters` の `gt` / `gte` / `lt` / `lte` は数値と、`date` / `datetime` フィールド（ISO 8601 の値）に使える。
並び替えと同じく **datetime は絶対時刻**（オフセット混在可）、**date は暦日**で比較する。

```json
"filters": [
  { "field": "publishDate", "operator": "gte", "value": "2026-01-01T00:00:00+09:00" },
  { "field": "publishDate", "operator": "lt", "value": "2027-01-01T00:00:00+09:00" }
]
```

- `datetime` フィールドを日付だけ（`"2026-01-01"`）で比較すると **UTC 00:00** として扱う。日本時間の境界で切るときは上のようにオフセット付きで書く。
- 「今日以降」のようなビルド時刻基準の相対指定は無い（固定の日時を書く）。

## ナビゲーション（前/次/最初/最後コンテンツ）

`detail` レシピに `navigation` を設定すると、同一コンテンツタイプの並び順における **前 / 次 / 最初 / 最後** のコンテンツが詳細データに自動で埋め込まれる。記事詳細の「← 前の記事 / 次の記事 →」ナビなどに使う。

```json
{
  "type": "detail",
  "outputPath": "news/{$this.slug}/index.json",
  "templatePath": "news/_detail/index.html",
  "navigation": {
    "sort": [{ "field": "publishDate", "direction": "desc" }],
    "filters": [{ "field": "status", "operator": "eq", "value": "published" }],
    "fields": ["slug", "title", "publishDate"]
  }
}
```

- `sort` / `filters`: 並び順・対象の基準（一覧と同じ書式・複数キー可）。この整列済みリスト上の位置で隣接を解決する。
- `fields`: 各ナビ項目に含める追加フィールド（`null`/未指定 = data の全フィールド）。

**出力されるプロパティ**（詳細データの直下に追加。テンプレートからそのままバインド可）:

| プロパティ | 内容 |
|---|---|
| `prev` | 整列リストで 1つ前のコンテンツ（先頭では `null`） |
| `next` | 整列リストで 1つ後のコンテンツ（末尾では `null`） |
| `first` | 最初のコンテンツ |
| `last` | 最後のコンテンツ |

各プロパティは `{ contentId, slug, title, href, ...fields で指定したフィールド }` のオブジェクト。`href` はこの詳細レシピの `outputPath` から自動生成される **実ページURL**（`.json` → `.html`、先頭に `/`、末尾 `/index.html` は `/` に正規化）。

| レシピの outputPath | 生成される `href` |
|---|---|
| `news/{$this.slug}/index.json` | `/news/{slug}/` |
| `news/{$this.slug}.json` | `/news/{slug}.html` |

**テンプレート利用例**（端では `prev`/`next` が `null` なので `data-gen-if` で出し分ける）:

```html
<nav class="p-article__nav">
  <template data-gen-scope="" data-gen-if="prev">
    <a class="p-article__nav-prev" data-gen-attrs="href:prev.href" data-gen-text="prev.title">前の記事</a>
  </template>
  <template data-gen-scope="" data-gen-if="next">
    <a class="p-article__nav-next" data-gen-attrs="href:next.href" data-gen-text="next.title">次の記事</a>
  </template>
</nav>
```

> `navigation` は任意。未設定の `detail` レシピは従来どおり（`prev`/`next`/`first`/`last` は出力されない）。

## 一覧のページ送り（pagination 付き list）

`pagination` 付きの `list` は各ページのデータに次を出力する（`ListPageLink` = `{ number, href, current }`）。

| プロパティ | 内容 |
|---|---|
| `currentPageNumber` / `totalPagesCount` / `totalItemsCount` | 現在ページ番号 / 総ページ数 / 総件数 |
| `pagedItems` | このページのアイテム |
| `prevPage` / `nextPage` | 前 / 次のページ（端では `null`） |
| `firstPage` / `lastPage` | 最初 / 最後のページ |
| `pages` | 全ページ（ページ番号リスト用。現在ページは `current: true`） |

`href` は各ページの出力パス（1 ページ目は `pagination.startPath`、2 ページ目以降は `outputPath` の `{$page}`）から
詳細の `navigation` と同じ規則で算出する（例: `news/index.json` → `/news/`、`news/page/2.json` → `/news/page/2.html`）。
テンプレートで文字列を組み立てる必要はない。手本は雛形の `news/index.html`:

```html
<nav class="p-news-list__pager" aria-label="ページ送り">
  <template data-gen-scope="" data-gen-if="prevPage">
    <a class="p-news-list__pager-prev" rel="prev" data-gen-attrs="href:prevPage.href">前へ</a>
  </template>
  <ol class="p-news-list__pager-pages">
    <template data-gen-scope="" data-gen-repeat="pages" data-gen-repeat-name="page">
      <li class="p-news-list__pager-item">
        <a class="p-news-list__pager-page" data-gen-attrs="href:page.href,aria-current:page.current" data-gen-text="page.number">1</a>
      </li>
    </template>
  </ol>
  <template data-gen-scope="" data-gen-if="nextPage">
    <a class="p-news-list__pager-next" rel="next" data-gen-attrs="href:nextPage.href">次へ</a>
  </template>
</nav>
```

## customField で値を組み立てる（定数＋変数の連結）

gentl の `data-gen-attrs` は `属性:データパス` 形式のみで**テンプレート内では文字列結合できない**。
`href` や画像 `src` のように「定数＋変数」で URL を組み立てたい場合は、**レシピの `customField`**
（`source` に定数と `{$this.xxx}` を混在させる）でデータ層で連結する。雛形は次の2つを参考実例として同梱している。

**① 記事詳細へのリンク**（`index.html` / `news/index.html` の一覧カード）

`list` / `relationList` のアイテムには `href` が**自動付与されない**（自動なのは `navigation` の
`prev`/`next`/`first`/`last` のみ）。一覧から詳細へリンクするには customField で組み立てる:

```json
{ "field": "href", "source": "/news/{$this.slug}/", "type": "string" }
```

テンプレート側は `<a data-gen-attrs="href:article.href">`。値は詳細レシピの `outputPath`
(`news/{$this.slug}/index.json` → `/news/{slug}/`) と一致させること。

**② ストレージ画像の参照**（`news/_detail/index.html` のアイキャッチ）

`image` フィールドの `url` は R2 の**生キー**（例: `2026/<uuid>/medium.webp`）。公開サイトで表示するには
コンテンツ配信 Worker の `/storage/*` 配信に合わせて `/storage/` を前置する:

```json
{ "field": "eyecatchSrc", "source": "/storage/{$this.eyecatch.url}", "type": "string" }
```

テンプレート側は `<img data-gen-attrs="src:eyecatchSrc,alt:title">`（表示可否は `data-gen-if="eyecatch"` で制御）。

> `source` に定数を混ぜると複数変数モードになり文字列連結される（単一変数のみなら値の型を保持）。
> `{$this.eyecatch.url}` のようにドット記法でネストしたフィールドも参照できる。
