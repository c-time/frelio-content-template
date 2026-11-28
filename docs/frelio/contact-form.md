# お問い合わせフォーム（任意機能）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

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
- Turnstile の配色は `<form data-turnstile-theme="...">` で指定する（`light`（既定）/ `dark` / `auto`＝OS のダークモードに追従。未指定・不正値は `light`）。
- Turnstile 未チェックで送信されたときは、ウィジェット直下の `#contact-turnstile-hint`（`role="alert"`・初期 `hidden`）に「スパム対策の確認のチェックをしてください」を出し、ウィジェットまでスクロールする。チェック完了（Turnstile の `callback`）で消える。見た目は `_p-contact.scss` の `.p-contact__turnstile-hint`（上向きの三角は `::before` の border）。

CMS 管理画面側:
- 「基本設定」→「お問い合わせ API URL（contactApiUrl）」に Worker URL を設定すると、受信箱（`/inbox`）・未読バッジ・プッシュ通知が有効になる。管理者は受信箱で「通知を有効にする」を押して購読する（iOS は「ホーム画面に追加」後・16.4+ のみ）。
- 受信箱（受信した個人情報データ）は**専用権限** `canViewSubmissions`（閲覧）/ `canEditSubmissions`（削除）でゲートし、`/users` の権限管理で付与する（既定は owner/admin のみ）。worker 側でも `users.json` を読んでサーバ強制するため、権限を付与した `users.json` を `develop` ブランチへ反映しないと owner 以外はアクセスできない。
- **フォーム受信設定**（自動メール・Webhook・プッシュ通知の設定）は受信データとは別物の**専用権限** `canViewFormSettings`（閲覧）/ `canEditFormSettings`（編集）でゲートする。ダッシュボードの「開発」→「フォーム受信設定」から各設定へ遷移。設定変更は送信内容の送り先を作る操作のため、worker 側でもこの権限をサーバ強制する。
- **自動メール送信（任意）**: 送信時に条件一致したルールのメールを自前のメール送信サーバー（SMTP）・Gmail API・Cloudflare Email Sending のいずれかで送る（送信アカウントは CMS の「送信設定」で登録）。問い合わせ主への自動返信・担当者通知に使う。設定（複数ルール・発火条件・件名/本文テンプレート）は `frelio-data/admin/structure/mail-settings.json` が正本で、`/mail-settings` 画面が GitHub へ直接コミットして編集する。SMTP 接続情報は worker の vars / secret に設定する（`workers/contact/README.md`）。
- **Webhook 連携**: `/webhooks` 画面で外部サービスへの連携を管理。送信時に内容（全項目）を指定 URL へ POST（`json`/`slack` 形式、シークレット設定で HMAC-SHA256 署名）。Zapier/Make/n8n/Slack/Discord 等に連携できる。
- **プッシュ通知設定**: 有効/無効・宛先は `frelio-data/admin/structure/push-settings.json` で管理（購読情報は D1）。
