# AGENTS.md

AI コーディングアシスタント（Claude Code / Cursor / Cline / GitHub Copilot 等）向けの
プロジェクト説明の正本。各ツールの規約ファイル（`CLAUDE.md` / `.github/copilot-instructions.md` 等）は
このファイルを参照する。

Frelio（静的サイトジェネレーター内蔵の Git ベース CMS）で構築されたサイトリポジトリ。
お知らせブログ付きのシンプルなコーポレートサイト。

## プロジェクト構成

- `frelio-data/` — CMS データ（コンテンツタイプ、コンテンツ、テンプレート、レシピ）
  - `site/templates/` — テンプレート（配置 = 出力先 URL 構造）
  - `site/templates/common/styles/` — 共有 SCSS パーシャル（FLOCSS 亜種）
  - `site/templates/common/scripts/` — 共有 TypeScript（features/）
  - `site/data/data-json/` — SSG 中間データ（git 追跡対象）
- `public/` — SSG 出力（HTML + ビルド済みアセット、git 管理外）
- `worker/` — コンテンツ配信 Worker（`/storage/*` の R2 配信・siteMode）
- `scripts/` — ビルドスクリプト（tsx）

CMS 管理画面・デプロイ関連（`admin/`（SPA）, `admin-worker/`（バンドル済み Worker）, `worker/`（コンテンツ Worker）, `workers/`, `wrangler.admin.toml`, `wrangler.content.toml`）は
`npx @c-time/frelio-cli update` で追加・更新される。

## ブランチモデル / ブランチルール

このリポジトリは 4 ブランチで運用する。各ブランチへの push が GitHub Actions
（`.github/workflows/`）を発火し、デプロイが自動実行される。

| ブランチ | push 時の動作 | 役割 |
|---|---|---|
| `develop` | （デプロイなし） | 通常の開発・編集作業。**ここを起点にする** |
| `admin` | `deploy-admin.yml` | 管理画面（CMS Admin）をデプロイ |
| `staging` / `staging-*` | `build-staging.yml` | SSG ビルド + プレビュー（`staging-*` はチーム別プレビュー） |
| `main` | `promote-production.yml` | 本番デプロイ |

**直接編集禁止ブランチ: `main` / `admin` / `staging`**
これらへの push は本番・管理画面デプロイを自動で発火するため、直接コミット/push しない。

### 通常の編集フロー

- 編集作業は **`develop`** で行う。
- 本番反映は CMS の「直接デプロイ」ボタン（`direct-deploy.yml` を workflow_dispatch で発火）から実行する。
  これが develop → staging マージ → SSG ビルド → staging プレビュー → main マージ → 本番デプロイ
  までを自動で行う。
- 管理画面（CMS Admin）は **`admin` ブランチへの push でのみ** デプロイされる（`deploy-admin.yml`）。
  `npx @c-time/frelio-cli update` で admin バンドル / Worker / Workers を更新し、変更を
  `develop` へコミット/マージしても、**`admin` ブランチを進めるまで管理画面には反映されない**。
  反映するには `admin` を直接編集せず、メインブランチを fast-forward で `admin` へ進めて push する:

  ```bash
  # develop は各プロジェクトのメインブランチ名に読み替える
  git push origin origin/develop:admin
  ```

### 確認ワークフロー（3 段階）

「どこまで確認したいか」で操作と反映先が決まる。通常は CMS の「直接デプロイ」ボタンで①〜③を一括実行するが、
手動で段階的に進めることもできる。

| 確認したいこと | 操作 | 起動 CI | 反映先 |
|---|---|---|---|
| ローカル確認 / まだ編集中 | コミット or `develop` push | なし | ローカル / `origin/develop` |
| ステージングプレビュー | `develop` push ＋ `staging` をマージして push | `build-staging.yml` | `staging-<contentWorkerName>.<subdomain>.workers.dev` |
| 本番化 | 上記＋`main` をマージして push | `promote-production.yml` | 本番ドメイン |

- **プレビュー URL**: Workers の preview-alias による `staging-<contentWorkerName>.<subdomain>.workers.dev`（`<subdomain>` は Cloudflare アカウントの workers.dev サブドメイン）。`staging-*` も同様に `<branch>-<contentWorkerName>.<subdomain>.workers.dev`。
  `admin/config.json` の `previewUrl` にも既定のプレビュー URL が入る。
- **本番 URL**: `admin/config.json` の `productionUrl`。

手動で進める場合（`origin/*` を基点に **マージ方式** で進める。下記「マージ方式」の注意を必ず守る）:

```bash
git fetch origin
git checkout -B develop origin/develop
git add -A && git commit -m "..."
git push origin develop                  # ① CI なし
git checkout -B staging origin/staging
git merge origin/develop --no-edit
git push origin staging                  # ② build-staging.yml → プレビュー
git checkout -B main origin/main
git merge origin/staging --no-edit
git push origin main                     # ③ promote-production.yml → 本番
```

> **マージ方式（重要）**: `staging` も `main` もマージコミット履歴（`Merge develop into staging` /
> `Merge staging into main`）を持つため、`develop:staging` や `staging:main` の **fast-forward push・
> `git merge --ff-only` は失敗しうる**。必ず `git merge ... --no-edit` を使うこと（`direct-deploy.yml`
> も同方式）。ローカルの `develop` / `staging` が古いことがあるので、上記のように **`origin/*` を基点**にする。

### AI コーディングアシスタントへの注意

- 明示的な指示がない限り、`main` / `admin` / `staging` へ直接 push しない。
- git 操作は `develop` を基点に行い、デプロイは上記フローに委ねる。

### 依存の自動更新（Dependabot）

`.github/dependabot.yml` が `github-actions` を毎週監視し、ワークフローのアクション更新 PR を
このリポジトリに自動で立てる。ワークフローはアクションを major タグ（例: `actions/checkout@v6`）で
参照しており、patch/minor は自動追従する。PR の確認・マージは利用者の責任。
テンプレート自体を最新化したい場合は `npx @c-time/frelio-cli update --templates-only` を使う。

## よく使うコマンド

```bash
npm run dev                # Vite dev server（gentl ライブプレビュー: 実URL描画 + 自動リロード）
npm run dev:admin          # CMS 管理画面をローカル起動（wrangler dev、http://localhost:5173/）
npm run build              # 静的アセットコピー + SCSS/TS ビルド（ページ別エントリー）
npm run generate           # data-json 生成（差分ビルド）
npm run generate:full      # data-json 生成（フルリビルド）
npm run generate:html      # HTML 生成（data-json → public/）
npm run bake               # テンプレ焼き込み（include/repeat を解決しテンプレ自身へ書き戻し）
npm run generate:sitemap   # sitemap.xml 生成
npm run generate:dep-map   # 依存マップ生成
npm run watch:content      # コンテンツ変更監視（インデックス自動更新）
npm run rebuild:indexes    # インデックス一括再構築
npx @c-time/frelio-cli update     # CMS Admin バンドル更新
npx @c-time/frelio-cli add-staging  # カスタムステージング追加
npx @c-time/frelio-cli set-domain   # 公開後の URL/ドメイン変更（config.json + 派生ファイル一括再生成）
```

## dev ライブプレビュー

`npm run dev` は gentl でオンザフライ描画するライブプレビュー（`vite-plugins/gentl-preview-plugin.ts`）。

- 実URL（`/`・`/news/`・`/news/<slug>`・`/about/` 等）にアクセスすると、data-json を gentl で描画し include（head/header/footer）込みの実ページを返す。**テンプレートのパス（`news/_detail/index.html` 等）を直接開く必要はない。**
- 起動時に依存マップ + data-json を自動生成する（初回は数秒かかる）。
- テンプレ（`*.htm`/`*.html`）編集 → 自動リロード、SCSS 編集 → HMR、`contents/` 編集 → data-json 自動再生成 → リロード。
- gentl 描画エラー時は 500 でエラー内容を表示する。

## ビルドパイプライン

```
1. Recipe → 依存マップ        (npm run generate:dep-map)
2. コンテンツ → data-json     (npm run generate)
3. data-json → HTML           (npm run generate:html)
4. SCSS/TS → CSS/JS           (npm run build)
5. sitemap.xml 生成           (npm run generate:sitemap)
```

## テンプレート焼き込み（bake / サーバー無しプレビュー）

共通クローム（header/footer/head）を `_parts/*.htm` に切り出し `data-gen-include` で取り込むと
保守性は上がるが、テンプレートを素のブラウザ（file://）で直接開いてもクロームが解決されず表示されない
（include はビルド/サーバーが解決するため）。

**焼き込み（bake）** はこれを解決する。各ページテンプレを gentl で1パス処理し、`data-gen-include`
（共通クローム）と `data-gen-repeat`（実サンプルデータ）を解決した結果を **テンプレート自身へ書き戻す**。

```bash
npm run generate     # 先に data-json を生成（bake はこれを入力にする）
npm run bake         # テンプレを焼き込み（パーツ変更後に実行して全ページへ伝播）
npm run bake:dry-run # 書き込まず結果のみ確認
npm run bake:check   # 冪等性検証（CI 用・焼き込みが最新でなければ非0終了）
```

- **使いどころ**: `_parts/*.htm` を変更したら `npm run bake` で全ページへ伝播し、焼き込み済みテンプレを
  file:// で開いてクローム＋実データを確認する。
- **冪等**: gentl 出力は `<template data-gen-*>` ソースを保持する（ブラウザでは不可視）。描画結果は
  `data-gen-cloned` 兄弟として追記されるため、焼き込み済みテンプレも再ビルド・再 bake できる
  （`npm run bake` を2回流すと差分なし）。
- **代表データ**: detail テンプレ（多数の記事が共有）は代表1件を焼き込む。既定は最新（`--pick latest`）、
  `--pick first` で先頭に切替可。実ビルド（`generate:html`）は各記事分を正しく生成するので影響しない。
- **アセット**: 焼き込みテンプレは `/styles/...`・`/scripts/...` を絶対パスで参照するため、file:// 直開きでは
  CSS/JS は読み込まれない（構造＋クローム＋実データは見える・無スタイル）。スタイル込みの確認は `npm run dev`
  のライブプレビューを使う。

> CLI からも実行できる: `npx @c-time/frelio-cli bake`（既存サイト向け。雛形の `npm run bake` と同一処理）。

## テンプレート構造（= URL 構造）

テンプレートの配置がそのまま出力先の URL パスになる。各ページに `styles/index.scss` と `scripts/index.ts` がある。

```
frelio-data/site/templates/
├── _parts/              — 共通パーツ（head.htm, header.htm, footer.htm）
├── common/              — 全ページ共通
│   ├── scripts/         — JS 初期化 + features/
│   ├── styles/          — SCSS パーシャル（FLOCSS: foundation/, layout/, component/, element/, project/）
│   └── images/          — favicon, logo 等
├── index.html           — / （ホーム）
├── scripts/index.ts     — ホーム用 JS
├── styles/index.scss    — ホーム用 CSS（p-hero, p-news-list）
├── images/              — ホーム画像
├── 404.html             — /404.html（エラーページ。共通バンドルのみ・noindex）
├── about/               — /about/
│   ├── index.html
│   ├── scripts/index.ts
│   ├── styles/index.scss（p-about）
│   └── images/
├── contact/             — /contact/
│   ├── index.html
│   ├── scripts/index.ts
│   ├── styles/index.scss（p-contact）
│   └── images/
└── news/                — /news/
    ├── index.html       — 一覧テンプレート
    ├── _detail/index.html — 詳細テンプレート（レシピで news/{slug}/index.html に展開）
    ├── scripts/index.ts — 一覧・詳細で共有
    ├── styles/index.scss（p-news-list, p-article）
    └── images/
```

- `_parts/head.htm` で common の CSS/JS を読み込み
- 各ページテンプレートでページ固有の CSS/JS を読み込み

### スラッグ展開

テンプレートファイル名と出力パスの対応はレシピ（`build-data-recipe.json`）で制御する。
gentl の規約ではなく、レシピの書き方次第。

- **ディレクトリベース**: `news/_detail/index.html` → `news/{slug}/index.html`（現在の設定。URL は `/news/{slug}/`）
- **ファイルベース**: `news/detail.html` → `news/{slug}.html`（別方式、必要に応じて変更可。URL は `/news/{slug}.html`）

## ビルドレシピと URL リプレーサー

**ファイルパス:** `frelio-data/admin/recipes/build-data-recipe.json`

コンテンツから出力ファイル（とその URL パス）をどう生成するかを定義する。
出力先 URL は `outputPath` で指定し、**リプレーサー（テンプレート変数）でコンテンツごとに動的に展開する**。

### レシピタイプ

| タイプ | 説明 | 用途 |
|-------|------|------|
| `detail` | 1コンテンツ = 1出力ファイル | 記事詳細ページ |
| `list` | 複数コンテンツ = 1つ以上の出力ファイル | 一覧・ページネーション |
| `static` | コンテンツに紐づかない固定出力 | トップページ等 |

### outputPath のリプレーサー（テンプレート変数）

| 変数 | 説明 | 例 |
|------|------|---|
| `{$this.slug}` | コンテンツの slug フィールド | `news/{$this.slug}.json` |
| `{$this.xxx}` | コンテンツの任意フィールド（ドット記法可） | `{$this.category}/{$this.slug}.json` |
| `{$page}` | ページ番号（ページネーション時） | `news/page/{$page}.json` |

### 必須ルール（重要）

- **`detail` レシピの `outputPath` には必ず `{$this.xxx}` リプレーサーを含める。**
  含めないと全コンテンツが同一ファイルに解決され衝突する（ビルド時に `MISSING_DETAIL_REPLACER` エラーになる）。
- リプレーサーに使えるのは **`useAsUrl: true` のフィールドのみ**（通常は `slug`）。コンテンツタイプ定義（`content_types/{id}.json`）で `useAsUrl` を設定する。
- **ページネーション付き `list` レシピの `outputPath` には `{$page}` を含める。**

### 例

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

### ナビゲーション（前/次/最初/最後コンテンツ）

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

### customField で値を組み立てる（定数＋変数の連結）

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

## CSS 記法ルール（FLOCSS 亜種・厳格）

- **プレフィックス**: `l-`（layout）、`c-`（component）、`p-`（project）、`e-`（element）のみ
- **1 class ルール**: HTML の class 属性には必ず 1 クラスのみ
- **Utility は絶対使用禁止**
- **SCSS の `&` でクラス名を接続することは禁止**（grep で追跡可能を維持）
- **@extend**: 同ファイル内でのみ許可。`%placeholder` または実体クラスに `--variant` サフィックス
- **子要素**: `__` で繋げる（深さ制限なし）
- **バリアント**: `--` サフィックス（数に制限なし）
- **メディアクエリ**: `@mixin` で定義し、1 ファイルに各 mixin を 1 回のみ `@include`

### 例

```scss
%c-section__inner__item {} // ベースデザイン
.c-section__inner__item--red { @extend %c-section__inner__item; color: red; }
```

## TypeScript ルール

- 共通の初期化ロジックは `common/scripts/index.ts` に集約
- 各機能は `common/scripts/features/` にファイル分離
- ページ固有の JS が必要な場合は `{page}/scripts/index.ts` に追加

## テンプレート規約

- テンプレートエンジン: gentl（`data-gen-*` 属性ベース）
- テンプレートは valid HTML。共通クローム（head/header/footer）は `_parts/*.htm` を `data-gen-include` で取り込む（静的フォールバックは併記しない＝二重描画を防ぐ）。
- **動的コンテンツ（`data-gen-text`/`data-gen-html`/`data-gen-attrs` 等）は必ず `<template data-gen-scope>`（または `data-gen-repeat`/`data-gen-if`/`data-gen-include`）の内側に置く。** gentl はトップレベル（scope 外）の `data-gen-*` を描画しない。描画結果は `data-gen-cloned` 兄弟として `<template>` の直後に追記され、`<template>` ソースは保持される（不可視・再ビルド/再 bake 可能）。
- 一覧のダミー行・詳細のダミー本文は `<template>` の内側に置く（描画クローンからは除去され、ソース上の設計参照としてのみ残る）。
- 素のブラウザ（file://）でクローム＋実データを見るには `npm run bake`（[テンプレート焼き込み](#テンプレート焼き込み-bake--サーバー無しプレビュー)）。スタイル込みの確認は `npm run dev`。
- 共通パーツ: `_parts/*.htm`（head, header, footer）。`head.htm` は共通 head（charset/viewport/共通CSS・JS）のみ。`<title>` とページ別 CSS/JS は各ページが持つ。
- ページテンプレート: `{page}/index.html`（ホームは `index.html`）
- 詳細テンプレート: `{page}/_detail/index.html`（レシピでスラッグ展開し `{page}/{slug}/index.html` へ）

## Cloudflare Workers 構成

公開サイト（コンテンツ配信）と管理画面（CMS Admin）は、それぞれ独立した Cloudflare Worker（Static Assets）として配信する。`npx @c-time/frelio-cli init` / `update` 実行後に以下が配置される:

- `wrangler.content.toml` … コンテンツ配信 Worker。`worker/index.ts`（R2 配信 `/storage/*` ＋ siteMode）＋ `[assets]`（SSG 出力 `public/`）。`run_worker_first` は live 時 `["/storage/*"]`。
- `wrangler.admin.toml` … 管理画面 Worker。`admin-worker/index.js`（`/api/*` ルーター：OAuth・ストレージ）＋ `[assets]`（SPA `admin/`、`not_found_handling="single-page-application"`）。`run_worker_first` は `["/api/*"]`。
- `worker/` … コンテンツ Worker のソース（`index.ts` / `site-mode.ts`）。
- `admin-worker/` … 管理画面 Worker のバンドル済み JS（npm 配布物・`update` で更新）。

> 静的アセット配信は無料・無制限で、`/storage/*`・`/api/*` のみ Worker を経由する。`workers/file-upload`・`workers/contact` は従来どおり独立 Worker。デプロイは GitHub Actions が `wrangler deploy`（本番）/ `wrangler versions upload --preview-alias <branch>`（staging プレビュー）で行う。

### エラーページ（404）

存在しない URL には `public/404.html` を **404 ステータスで自動配信**する。

- 生成: `build-data-recipe.json` の `staticPages` に `{ "type": "static", "outputPath": "404.json", "templatePath": "404.html" }` を持ち、SSG が `public/404.html` を出力する。
- 配信: コンテンツ配信 Worker の `wrangler.content.toml` は `[assets]` に `directory="./public"`・`not_found_handling="404-page"` を持つため、ルート直下の `404.html` が未マッチ URL に対し 404 で自動配信される。
- テンプレート `frelio-data/site/templates/404.html` は共通パーツ（`_parts/`）を流用し、`<meta name="robots" content="noindex">` を付与する。スタイルは `common/styles/project/_p-error.scss`（`common/styles/index.scss` から読込）。
- 500/503/403（公開準備中・メンテナンス）は本仕組みではなく下記「本番ゲート（siteMode）」が担当する。

## お問い合わせフォーム（任意機能）

お問い合わせフォームの送信受付・保存・通知は独立 Worker `workers/contact/`（`npx @c-time/frelio-cli update` で配置）が担う。Cloudflare D1 に保存し、管理者の PWA（CMS 管理画面）へ Web プッシュ通知を送る。**すべて Cloudflare 無料枠内**（Workers / D1 / Turnstile / Web Push）。

セットアップ手順は `workers/contact/README.md` を参照（要約）:

1. `cd workers/contact && cp wrangler.toml.example wrangler.toml`
2. `npx wrangler d1 create frelio_contact` → 出力された `database_id` を wrangler.toml に設定
3. `npx wrangler d1 migrations apply frelio_contact --remote`
4. VAPID 鍵生成（`npx web-push generate-vapid-keys --json`）と Turnstile を作成し、`npx wrangler secret put` で `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `TURNSTILE_SECRET` を投入
5. wrangler.toml `[vars]` の `ALLOWED_ORIGINS`（公開サイト + 管理画面オリジン）・`CONTENT_REPO`・`TURNSTILE_SITE_KEY`・`ADMIN_INBOX_URL` を設定
6. `npx wrangler deploy`

公開フォーム側（`frelio-data/site/templates/contact/`）:
- `index.html` の `<form data-contact-api="...">` にデプロイした Worker の URL を設定する（空ならフォームは送信無効）。Turnstile サイトキーは Worker の `/config` から取得して明示レンダリングする。

CMS 管理画面側:
- 「基本設定」→「お問い合わせ API URL（contactApiUrl）」に Worker URL を設定すると、受信箱（`/inbox`）・未読バッジ・プッシュ通知が有効になる。管理者は受信箱で「通知を有効にする」を押して購読する（iOS は「ホーム画面に追加」後・16.4+ のみ）。
- 受信箱（受信した個人情報データ）は**専用権限** `canViewSubmissions`（閲覧）/ `canEditSubmissions`（削除）でゲートし、`/users` の権限管理で付与する（既定は owner/admin のみ）。worker 側でも `users.json` を読んでサーバ強制するため、権限を付与した `users.json` を `develop` ブランチへ反映しないと owner 以外はアクセスできない。
- **フォーム受信設定**（自動メール・Webhook・プッシュ通知の設定）は受信データとは別物の**専用権限** `canViewFormSettings`（閲覧）/ `canEditFormSettings`（編集）でゲートする。ダッシュボードの「開発」→「フォーム受信設定」から各設定へ遷移。設定変更は送信内容の送り先を作る操作のため、worker 側でもこの権限をサーバ強制する。
- **自動メール送信（任意）**: 送信時に条件一致したルールのメールを自前のメール送信サーバー（SMTP）で送る。問い合わせ主への自動返信・担当者通知に使う。設定（複数ルール・発火条件・件名/本文テンプレート）は `frelio-data/admin/structure/mail-settings.json` が正本で、`/mail-settings` 画面が GitHub へ直接コミットして編集する。SMTP 接続情報は worker の vars / secret に設定する（`workers/contact/README.md`）。
- **Webhook 連携**: `/webhooks` 画面で外部サービスへの連携を管理。送信時に内容（全項目）を指定 URL へ POST（`json`/`slack` 形式、シークレット設定で HMAC-SHA256 署名）。Zapier/Make/n8n/Slack/Discord 等に連携できる。
- **プッシュ通知設定**: 有効/無効・宛先は `frelio-data/admin/structure/push-settings.json` で管理（購読情報は D1）。

## 予約反映（時刻ベースの自動公開/非公開・任意機能）

指定時刻にコンテンツを自動で公開／非公開にし、そのまま本番化（ビルド＋デプロイ）まで実行する。
「予約 = その時刻にビルドが1回走る操作」と認識させるため、コンテンツのフィールドではなく
**時刻ベースのイベント登録 UI**（1時刻=1スロット。同一時刻のアクションは1回のビルドにまとまる）を採る。
**すべて Cloudflare 無料枠内**（Workers + Durable Objects の Alarm。cron ポーリングではなくイベント駆動）。

- **キューの正本**: `frelio-data/admin/structure/schedule-queue.json`（`slots[]` 構造。CMS が GitHub へ直接コミット）。
- **発火**: 小さな Worker `workers/scheduled-publish/`（Durable Object Alarm）が最も近い予約時刻ちょうどに
  `scheduled-publish.yml` を `workflow_dispatch` で起動する。1時間毎の cron が保険（reconcile）。
- **適用**: `scheduled-publish.yml` が `scripts/process-schedule.ts`（content-ops の共有ロジック）で
  期限到来スロットを develop に適用し、`_deploy.yml`（直接デプロイと共通）で本番化する。
- **権限は最小**: Worker の PAT は **Actions: write ＋ Contents: read のみ**（contents:write は不要。
  実コミットはワークフローの `GITHUB_TOKEN` が行う）。
- **有効化（opt-in）**: `workers/scheduled-publish/README.md` の手順で Worker をデプロイし、CMS の
  「基本設定」→「予約反映 API URL（scheduleApiUrl）」にその URL を設定する。設定の有無が機能の有効化を兼ねる。
- **権限**: 予約反映の閲覧/編集は `canViewSchedule` / `canEditSchedule`（既定 owner/admin）。
- CMS 側の導線はダッシュボードの「プレビューに反映してそのまま本番化」直下（次の予約時刻を1つ表示）。

## 本番ゲート（公開状態の制御 / siteMode）

サイトの公開状態は `config.json` の `siteMode` で制御する。siteMode はコンテンツ配信 Worker にビルド時へ焼き込まれる（`worker/site-mode.ts` の `SITE_MODE` 定数 ＋ `wrangler.content.toml` の `run_worker_first`）。

| siteMode | 挙動 |
|---|---|
| `live`（既定） | 通常配信（静的ページは Worker を経由しない＝オーバーヘッド0） |
| `prelaunch` | `/storage/*` 以外を 403（公開準備中） |
| `maintenance` | `/storage/*` 以外を 503 |
| `closed` | storage 含め全遮断（503） |

- 切替: `npx @c-time/frelio-cli set-mode <live|prelaunch|maintenance|closed>` 後、**コンテンツを再デプロイ**して反映（`worker/site-mode.ts` と `wrangler.content.toml` が再生成される）。
- 非 live のときのみ `run_worker_first=true` となり、Worker が全リクエストで holding page（403/503・noindex）を返す。live では静的ページに Worker が介在しない。
- 本番は独自ドメインのみで配信する（`workers_dev=false` で `workers.dev` を無効化）。

### 管理画面のローカル起動

```bash
# 1. OAuth シークレットを用意（初回のみ）
cp .dev.vars.example .dev.vars
# .dev.vars を編集し、GitHub OAuth App の Client ID / Secret を設定

# 2. 依存インストール（初回のみ）
npm install

# 3. 管理画面を起動（admin Worker をローカル実行: wrangler dev --config wrangler.admin.toml）
npm run dev:admin
# → http://localhost:5173/ で管理画面にアクセス
```

- `admin/` のビルド済み SPA を配信し、`/api/*`（OAuth・ファイル API）を管理画面 Worker が処理する。`npm run dev`（Vite）はテンプレート編集用で、管理画面は起動しない。
- GitHub ログインのコールバック URL は OAuth App 側の設定に依存する。`http://localhost` がコールバックに登録されていない場合は、cloudflared 等のトンネルで HTTPS 公開した URL からアクセスする必要がある。

## 型パッケージ活用方針

JSON ファイルの読み書きでは、以下の型・ガード・スキーマを使用する。

| ファイル | 型 | パッケージ |
|---|---|---|
| `content_types/*.json` | `ContentType` / `validateContentType` | `@c-time/frelio-types` |
| `*.ui.json` | `ContentTypeUi` / `validateContentTypeUi` | 同上 |
| `*.views.json` | `ContentTypeViews` / `validateContentTypeViews` | 同上 |
| `build-data-recipe.json` | `FrelioBuildDataRecipe` / `validateSiteRecipe` | 同上 |
| `data-json/*.json` | `FrelioDataJson` / `isFrelioDataJson` | `@c-time/frelio-data-json` |
| `contents/*/*.json` | `Content` / `isContent` | `@c-time/frelio-types` |

## コンテンツの自動採番（通し番号 / 管理番号 `seq`）

各コンテンツには、コンテンツタイプ単位の連番 `seq`（管理番号）が新規作成時に自動付与される。一覧/詳細に `#1` 形式で表示され、会話での参照に使える。

- **ユニーク性は保証しない。** 別ブランチでの並行作成・削除により重複や欠番が起こりうる、利便性・表示用の番号。**一意キーは UUID（`contentId`）。** 一意性が必要な箇所では必ず `contentId` を使うこと。

## 日付の記法（重要）

`date` 型フィールド（例: `publishDate`）の値は、**必ず ISO 8601 の日付形式 `YYYY-MM-DD` で記述すること**（例: `2026-06-11`）。

- `June 11, 2026` / `2026/6/1` / `2026-06-11T00:00:00.000Z` のような自由形式・別区切り・時刻付きの値は**不可**。CMS の入力欄（DatePicker）が解釈できず、保存値のバリデーションでも弾かれる。
- コンテンツ JSON を手で編集・生成する場合も同じ。`data.publishDate` などは `"2026-06-11"` の形にする。

### `date`（暦日）と `datetime`（日時）の使い分け

- **`date`（暦日）**: 時刻・タイムゾーンを持たない `YYYY-MM-DD`。公開日のような「日」を表すフィールドに使う。
- **`datetime`（日時）**: 時刻を持つ値は `datetime` 型で扱い、**オフセット付き ISO 8601 で記述する**（例: `2026-06-11T19:00:00+09:00`、UTC は `2026-06-11T10:00:00Z`）。
  - オフセットなしの裸の日時（`2026-06-11T19:00:00`）や日付だけ（`2026-06-11`）は `datetime` としては**不可**。CMS の入力欄（DateTimePicker）でもバリデーションでも弾かれる。
  - オフセット付きなので絶対時刻が一意に定まる。比較・ソートは絶対時刻（エポック）で行われる。

### タイムゾーン設定（3層）

日時のタイムゾーンは用途別に3か所で設定する。値はオフセット付きで自己記述的なので、各層で別の TZ を使っても絶対時刻は壊れない（表示・文字列化だけの話）。

1. **保存TZ（サイト全体）** — CMS の「基本設定」→「タイムゾーン」。`admin/config.json` の `saveTimezone`。`createdAt`/`updatedAt`/`publishedAt` や `datetime` を保存するときに付けるオフセット。テンプレート初期値は `+09:00`（日本）。未設定は UTC。
2. **UI表示TZ（編集画面）** — 各 `datetime` フィールドの「UI設定」→「表示タイムゾーン」（`{id}.ui.json` の `displayTimezone`）。フィールドで未指定なら **保存TZ** にフォールバック。
3. **出力TZ（ビルドデータレシピ）** — `admin/recipes/build-data-recipe.json`。トップレベルの `outputTimezone`（既定、テンプレート初期値 `+09:00`）＋ 各 `customFields` の `date` 整形での `timezone`（個別上書き）。フィールド未指定ならレシピ既定、それも無ければ UTC。

> 暦日（`date` 型）は時刻・TZ を持たないため、上記の TZ 設定の対象外（`YYYY-MM-DD` のまま）。

### 標準パターン: 公開日は datetime 入力・date 出力

テンプレートの `article.publishDate` はこのパターンを採用している（よくある構成）。

- **入力**: `datetime` 型。時刻まで持つので、同じ日でも投稿時刻で新しい順に並べられる。
- **出力**: ビルドデータレシピの `customFields` で `date`（`format: "YYYY-MM-DD"`）に整形し、サイトには**日付のみ**を出す。
- **並び順**: レシピの `sort` は生の `publishDate`（datetime）に対して効くため、整形（日付のみ表示）とは独立して**時刻まで含めた絶対時刻**で並ぶ。

時刻も併せて表示したいフィールドは、整形 `format` を `"YYYY-MM-DD HH:mm"` などにすればよい。
