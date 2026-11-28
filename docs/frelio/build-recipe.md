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

## ページ内の一覧を区切る（pagination 付き relationList）

`relationList` に `"pagination": { "perPage": N }` を付けると、**ページは 1 枚のまま**、結果を N 件ずつに区切った
**全ページ分**を 1 つのデータに埋め込む（ページを複数出力しない）。表示の切り替えはサイト側の JS / CSS で行う。
`pagination` が無ければ従来どおり配列。

```json
{
  "field": "latestNews",
  "type": "relationList",
  "contentTypeId": "news",
  "sort": { "field": "publishedAt", "direction": "desc" },
  "listFields": ["title"],
  "customFields": [{ "field": "href", "source": "/news/{$this.slug}/", "type": "string" }],
  "pagination": { "perPage": 2 }
}
```

出力（5 件のとき）:

```jsonc
{
  "totalItemsCount": 5,
  "totalPagesCount": 3,
  "pages": [
    { "number": 1, "current": true,  "pagedItems": [ /* 2 件 */ ] },
    { "number": 2, "current": false, "pagedItems": [ /* 2 件 */ ] },
    { "number": 3, "current": false, "pagedItems": [ /* 1 件 */ ] }
  ]
}
```

- 順序は filters → sort → offset / limit → ページ分割 → 各アイテムの `listFields` / `expand` / `customFields`。
- 各ページに `href` は無い（URL が分かれないため）。`current` は 1 ページ目だけ `true`（初期表示用）。
- 0 件なら `totalItemsCount: 0` / `totalPagesCount: 0` / `pages: []`。
- list 用の `numberFormatCount` / `startPath` は使わない。`perPage` は 1 以上の整数。

テンプレートは `pages` を繰り返し、その中で `pagedItems` を繰り返す（入れ子の `<template>` にも `data-gen-scope=""`。
繰り返し・条件の注意は [gentl-if-and-repeat.md](gentl-if-and-repeat.md)）:

```html
<template data-gen-scope="" data-gen-if="latestNews.pages.length">
  <section class="news-pager">
    <template data-gen-scope="" data-gen-repeat="latestNews.pages" data-gen-repeat-name="page">
      <ul class="news-pager__page" data-gen-attrs="data-page:page.number,data-current:page.current">
        <template data-gen-scope="" data-gen-repeat="page.pagedItems" data-gen-repeat-name="item">
          <li><a data-gen-attrs="href:item.href" data-gen-text="item.title">タイトル</a></li>
        </template>
      </ul>
    </template>
    <nav class="news-pager__nav">
      <template data-gen-scope="" data-gen-repeat="latestNews.pages" data-gen-repeat-name="page">
        <button type="button" data-gen-attrs="data-page:page.number,aria-current:page.current" data-gen-text="page.number">1</button>
      </template>
    </nav>
  </section>
</template>
```

真偽値は文字列で出る（`data-current="true"` / `"false"`）。`hidden` 属性は値に関係なく隠れてしまうので使わず、
初期表示は CSS、切り替えは JS で行う:

```css
.news-pager__page[data-current="false"] { display: none; }
```

```js
document.querySelectorAll('.news-pager').forEach((pager) => {
  pager.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-page]')
    if (!button) return
    const page = button.dataset.page
    pager.querySelectorAll('.news-pager__page').forEach((ul) => {
      ul.dataset.current = String(ul.dataset.page === page)
    })
    pager.querySelectorAll('button[data-page]').forEach((b) => {
      b.setAttribute('aria-current', String(b.dataset.page === page))
    })
  })
})
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

**③ 画像のサイズ違いを使い分ける（`srcset` / `img` / `picture`）**

管理画面は画像 1 枚につきサイズ違いの WebP（`thumbnail` 320 / `small` 640 / `medium` 1280 / `large` 1920 /
`retina` 2560、元画像が小さいと大きいサイズは作られない）を保存する。`source` に画像フィールドそのものを渡すと、
実際に保存されたサイズだけで組み立てる（前置は `admin/config.json` の `imagePublicUrl`＝画像の独自ドメイン配信が設定されていればそれ、無ければ `/storage/`）。雛形の記事詳細アイキャッチはこれを使っている:

```json
{ "field": "eyecatchSrcset", "source": "{$this.eyecatch}", "type": "srcset" }
```

```html
<img data-gen-attrs="src:eyecatchSrc,srcset:eyecatchSrcset,alt:title" sizes="(min-width: 780px) 780px, 100vw">
```

`<img>` / `<picture>` ごと HTML で出す場合は `type: "img"` / `"picture"`（`data-gen-html` で出力・alt などはエスケープ済み）:

```json
{ "field": "eyecatchImg", "source": "{$this.eyecatch}", "type": "img", "sizes": "100vw", "altSource": "{$this.title}", "className": "p-article__eyecatch__image" }
```

オプション: `presets`（使うサイズ。既定は `original` 以外の保存済みサイズ）/ `srcPreset`（src に使うサイズ）/
`sizes` / `loading`（既定 `lazy`）/ `className` / `altSource`（alt の式。既定は画像に保存された alt）/ `width` / `height`。
画像が未設定なら空文字（`data-gen-if` で出し分けられる）。幅記述子は各サイズの長辺の上限なので、縦長の画像では実幅より大きめになる。
`original` は切り抜き前の元画像なので既定では使わない。

> `source` に定数を混ぜると複数変数モードになり文字列連結される（単一変数のみなら値の型を保持）。
> `{$this.eyecatch.url}` のようにドット記法でネストしたフィールドも参照できる。

**④ ファイルのダウンロードリンク（`fileLink`）**

`file` フィールドを公開ページに出すときは、`source` にファイルフィールドそのものを渡す（`data-gen-html` で出力）:

```json
{ "field": "catalogLink", "source": "{$this.catalog}", "type": "fileLink" }
```

→ `<a href="/storage/2026/<uuid>/catalog.pdf" download="元のファイル名.pdf">元のファイル名.pdf</a>`。
オプション: `labelSource`（表示名の式。既定は元のファイル名）/ `download`（既定 `true`）/ `newTab`（`target="_blank"`）/ `className`。
未設定なら空文字。前置は常に `/storage/`（`imagePublicUrl` は画像専用）。ファイル名などはエスケープ済み。サイズ・種類は保存されていないので出せない。

URL だけ・ファイル名だけが欲しいときは `fileLink` ではなく `string` で取り出す（`url` type は URL エンコード用で、href を作るものではない）:

```json
{ "field": "catalogHref", "source": "/storage/{$this.catalog.url}", "type": "string" }
{ "field": "catalogName", "source": "{$this.catalog.originalName}", "type": "string" }
```

## リレーション展開（expand）

`relation` フィールド（ID 参照）を、参照先コンテンツの中身に置き換えて出力する。
`detail` / `list` の `expand`、ページネーション一覧の `items.expand`、`relationList` の `expand`、
ネストした `expand` のどこでも同じ設定が使える。

```json
"expand": [
  {
    "field": "relatedArticles",
    "fields": ["publishDate", "eyecatch"],
    "filters": [{ "field": "status", "operator": "eq", "value": "published" }],
    "sort": { "field": "publishDate", "direction": "desc" },
    "limit": 3,
    "customFields": [
      { "field": "href", "source": "/news/{$this.slug}/", "type": "string" },
      { "field": "publishDate", "source": "{$this.publishDate}", "type": "date", "format": "YYYY-MM-DD" }
    ]
  }
]
```

| キー | 説明 |
|------|------|
| `fields` | 含めるフィールド（指定時も `contentId` / `slug` / `title` は常に入る。未指定は全フィールド） |
| `filters` | 展開先を絞り込む（`list` / `relationList` と同じ演算子） |
| `sort` | 複数リレーションの並び順。**未指定なら編集者が選んだ順のまま** |
| `offset` / `limit` | スキップ件数 / 最大件数 |
| `customFields` | 展開した各コンテンツに適用（`{$this.xxx}` は展開先を指す。`relationList` の `customFields` と同じ） |
| `expand` | 展開先の relation をさらに展開する |

- 適用順: `filters` → `sort` → `offset` / `limit` → `fields` → （ネストした `expand`）→ `customFields`。
- 単一リレーション（1 件参照）が `filters` に外れた場合は `null` になる（テンプレートは `data-gen-if` で出し分ける）。
- 参照先が見つからない ID は除外される（ビルドレポートに `RELATION_NOT_FOUND`）。

## サイト設定を参照する（`{$site.*}` / `include.site`）

サイト名や本番 URL は `admin/config.json`（CMS の「基本設定」）の値を参照できる。
レシピにサイト名を直書きしない（サイト名を変えたときに全レシピを直す羽目になる）。

| 参照 | 値の出どころ | 例 |
|------|------------|---|
| `{$site.title}` | `siteTitle`（サイト名） | `My Site` |
| `{$site.url}` | `productionUrl`（本番 URL・**末尾スラッシュなし**） | `https://example.com` |

**customField の `source` から参照**（`detail` / `list` / `static` / `relationList` 内、どこでも使える。`include` 不要）:

```json
{ "field": "pageTitle", "source": "{$this.title} | {$site.title}", "type": "string" },
{ "field": "canonicalUrl", "source": "{$site.url}/news/{$this.slug}/", "type": "string" }
```

**テンプレートから直接使いたい場合**は、レシピ（`detail` / `list` / `static`）に `"include": { "site": true }` を付ける。
出力データに `site: { "title": ..., "url": ... }` が入り、`data-gen-text="site.title"` などで参照できる。

```json
{ "type": "static", "outputPath": "about/index.json", "templatePath": "about/index.html", "include": { "site": true } }
```

- 載るのは公開して問題ない `title` / `url` だけ（接続先 URL・Worker 名などの内部設定は出ない）。
- 値は**ビルド時**に `admin/config.json` から読む。サイト名・本番 URL を変えたら、全ページに反映させるため
  フルリビルド（`npm run generate:full`）を走らせる（差分ビルドは config.json の変更を検知しない）。
- CMS の記事プレビューも同じ値（基本設定）で組み立てる。

## RSS / Atom フィード（list の `feed`）

list レシピに `"feed": { "format": "rss", "outputPath": "news/feed.xml", "title": ..., "item": { ... } }` を書くと、
同じ filters / sort の先頭 `limit` 件（既定 20）から RSS / Atom を `public/` に出力する（配列で複数可）。
書き方・URL と日時の扱い・`productionUrl` が必須な理由は `docs/frelio/feed.md`。
