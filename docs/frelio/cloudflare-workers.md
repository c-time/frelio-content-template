# Cloudflare Workers 構成

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

公開サイト（コンテンツ配信）と管理画面（CMS Admin）は、それぞれ独立した Cloudflare Worker（Static Assets）として配信する。`npx @c-time/frelio-cli init` / `update` 実行後に以下が配置される:

- `wrangler.content.toml` … コンテンツ配信 Worker。`worker/index.ts`（R2 配信 `/storage/*` ＋ siteMode）＋ `[assets]`（SSG 出力 `public/`）。`run_worker_first` は live 時 `["/storage/*"]`。
- `wrangler.admin.toml` … 管理画面 Worker。`admin-worker/index.js`（`/api/*` ルーター：OAuth・ストレージ、`/storage/*`：R2 公開配信）＋ `[assets]`（SPA `admin/`、`not_found_handling="single-page-application"`）。`run_worker_first` は `["/api/*", "/storage/*"]`（本文インライン画像 `<img src="/storage/…">` を admin ドメインでも解決するため）。
- `worker/` … コンテンツ Worker のソース（`index.ts` / `site-mode.ts`）。
- `admin-worker/` … 管理画面 Worker のバンドル済み JS（npm 配布物・`update` で更新）。

> 静的アセット配信は無料・無制限で、`/storage/*`・`/api/*` のみ Worker を経由する。`workers/` 配下（`file-upload`・`contact`・`scheduled-publish`・`file-delivery`）は従来どおり独立 Worker。デプロイは GitHub Actions が `wrangler deploy`（本番）/ `wrangler versions upload --preview-alias <branch>`（staging プレビュー）で行う。

## エラーページ（404）

存在しない URL には `public/404.html` を **404 ステータスで自動配信**する。

- 生成: `build-data-recipe.json` の `staticPages` に `{ "type": "static", "outputPath": "404.json", "templatePath": "404.html" }` を持ち、SSG が `public/404.html` を出力する。
- 配信: コンテンツ配信 Worker の `wrangler.content.toml` は `[assets]` に `directory="./public"`・`not_found_handling="404-page"` を持つため、ルート直下の `404.html` が未マッチ URL に対し 404 で自動配信される。
- テンプレート `frelio-data/site/templates/404.html` は共通パーツ（`_parts/`）を流用し、`<meta name="robots" content="noindex">` を付与する。スタイルは `common/styles/project/_p-error.scss`（`common/styles/index.scss` から読込）。
- 500/503/403（公開準備中・メンテナンス）は本仕組みではなく下記「本番ゲート（siteMode）」が担当する。


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


## 管理画面のローカル起動

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
