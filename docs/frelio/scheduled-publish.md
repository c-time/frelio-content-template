# 予約反映（時刻ベースの自動公開/非公開・任意機能）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

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
