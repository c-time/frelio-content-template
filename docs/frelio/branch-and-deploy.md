# ブランチ運用の詳細（確認ワークフロー・手動での反映手順）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

ブランチの役割と禁止事項は `AGENTS.md` の「ブランチモデル / ブランチルール」が正本。ここは手順の詳細。

## 確認ワークフロー（3 段階）

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


## 依存の自動更新（Dependabot）

`.github/dependabot.yml` が `github-actions` を毎週監視し、ワークフローのアクション更新 PR を
このリポジトリに自動で立てる。ワークフローはアクションを major タグ（例: `actions/checkout@v6`）で
参照しており、patch/minor は自動追従する。PR の確認・マージは利用者の責任。
テンプレート自体を最新化したい場合は `npx @c-time/frelio-cli update --templates-only` を使う。
