# CLAUDE.md

Frelio（静的サイトジェネレーター内蔵の Git ベース CMS）で構築されたサイトリポジトリ。
お知らせブログ付きのシンプルなコーポレートサイト。

## プロジェクト構成

- `frelio-data/` — CMS データ（コンテンツタイプ、コンテンツ、テンプレート、レシピ）
  - `site/templates/` — テンプレート（配置 = 出力先 URL 構造）
  - `site/templates/common/styles/` — 共有 SCSS パーシャル（FLOCSS 亜種）
  - `site/templates/common/scripts/` — 共有 TypeScript（features/）
  - `site/data/data-json/` — SSG 中間データ（git 追跡対象）
- `public/` — SSG 出力（HTML + ビルド済みアセット、git 管理外）
- `functions/storage/` — R2 ファイル配信（/storage/*）
- `scripts/` — ビルドスクリプト（tsx）

CMS 管理画面関連（`admin/`, `functions/api/`, `workers/`, `wrangler.toml`, `_redirects`）は
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
- 管理画面の更新は `npx @c-time/frelio-cli update` 実行後、`admin` ブランチへ反映する。

### AI（Claude Code 等）への注意

- 明示的な指示がない限り、`main` / `admin` / `staging` へ直接 push しない。
- git 操作は `develop` を基点に行い、デプロイは上記フローに委ねる。

## よく使うコマンド

```bash
npm run dev                # Vite dev server（テンプレートプレビュー + コンテンツ監視）
npm run dev:admin          # CMS 管理画面をローカル起動（wrangler pages dev、http://localhost:5173/admin/）
npm run build              # 静的アセットコピー + SCSS/TS ビルド（ページ別エントリー）
npm run generate           # data-json 生成（差分ビルド）
npm run generate:full      # data-json 生成（フルリビルド）
npm run generate:html      # HTML 生成（data-json → public/）
npm run generate:sitemap   # sitemap.xml 生成
npm run generate:dep-map   # 依存マップ生成
npm run watch:content      # コンテンツ変更監視（インデックス自動更新）
npm run rebuild:indexes    # インデックス一括再構築
npx @c-time/frelio-cli update     # CMS Admin バンドル更新
npx @c-time/frelio-cli add-staging  # カスタムステージング追加
```

## ビルドパイプライン

```
1. Recipe → 依存マップ        (npm run generate:dep-map)
2. コンテンツ → data-json     (npm run generate)
3. data-json → HTML           (npm run generate:html)
4. SCSS/TS → CSS/JS           (npm run build)
5. sitemap.xml 生成           (npm run generate:sitemap)
```

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
    ├── detail.html      — 詳細テンプレート（レシピで news/{slug}.html に展開）
    ├── scripts/index.ts — 一覧・詳細で共有
    ├── styles/index.scss（p-news-list, p-article）
    └── images/
```

- `_parts/head.htm` で common の CSS/JS を読み込み
- 各ページテンプレートでページ固有の CSS/JS を読み込み

### スラッグ展開

テンプレートファイル名と出力パスの対応はレシピ（`build-data-recipe.json`）で制御する。
gentl の規約ではなく、レシピの書き方次第。

- **ファイルベース**: `news/detail.html` → `news/{slug}.html`（現在の設定）
- **ディレクトリベース**: `news/_detail/index.html` → `news/{slug}/index.html`（別方式、必要に応じて変更可）

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
- テンプレートは valid HTML（そのままブラウザで開ける）
- 共通パーツ: `_parts/*.htm`（head, header, footer）
- ページテンプレート: `{page}/index.html`（ホームは `index.html`）
- 詳細テンプレート: `{page}/detail.html`（レシピでスラッグ展開）

## Cloudflare Pages 構成

`npx @c-time/frelio-cli update` 実行後に以下が配置される:
- `_redirects`: `/admin/*` → SPA、`/*` → `/public/:splat`
- `_routes.json`: `/api/*`, `/storage/*` → Functions
- `wrangler.toml`: R2 バケットバインディング

### 管理画面のローカル起動

```bash
# 1. OAuth シークレットを用意（初回のみ）
cp .dev.vars.example .dev.vars
# .dev.vars を編集し、GitHub OAuth App の Client ID / Secret を設定

# 2. 依存インストール（初回のみ）
npm install

# 3. 管理画面を起動（リポジトリルートを wrangler pages dev で配信）
npm run dev:admin
# → http://localhost:5173/admin/ で管理画面にアクセス
```

- `admin/` のビルド済み SPA を静的配信し、`functions/api/*`（OAuth・ファイル API）を Pages Functions として実行する。`npm run dev`（Vite）はテンプレート編集用で、管理画面は起動しない。
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
