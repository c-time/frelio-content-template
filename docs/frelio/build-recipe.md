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
- **ページネーション付き `list` レシピの `outputPath` には `{$page}` を含める。**

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
          "pagination": { "perPage": 10, "numberFormatCount": 1 }
        }
      ]
    }
  }
}
```

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
