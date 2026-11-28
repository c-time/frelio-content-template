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

## 本番を前の状態に戻す（ロールバック）

CMS の「本番化履歴」→「この時点に戻す」が `rollback-production.yml` を `workflow_dispatch`（入力 `tag`＝戻し先の
デプロイタグ `d{バージョン}.{連番}`）で起動する。ワークフローは次を行う。

1. `tag` がデプロイタグの形式で、実在するタグかを検証する（ブランチ名や SHA は受け付けない）。
2. `main` を「そのタグの時点のツリー」にする**新しいコミットを 1 つ**作って push する（force push しない・履歴は線形に
   1 コミット増えるだけ）。`.github/workflows` だけは現在のまま残す（`GITHUB_TOKEN` はワークフローを変更する push が
   できないため）。コミットには `Frelio-Rollback: <タグ>` の行が入る。
3. キャッシュを使わずにフルビルドして本番へ `wrangler deploy` し、新しいデプロイタグを付ける（注釈にも `Frelio-Rollback:`）。

注意:

- **`develop` / `staging` は戻さない。** 次に本番化すると、戻した変更が再び本番に出る。
- **ロールバック後の最初の本番化は `main` を `staging` の内容に揃える。** `main` の先頭側（直近の staging 取り込みの
  マージより後）に `Frelio-Rollback:` のコミットがあると、`_deploy.yml` と CMS の「本番に反映」は 3-way マージの代わりに
  「`staging` のツリーを持つ 2 親のマージコミット」を作る（3-way マージだと戻した変更が戻ったまま残る／コンフリクトする）。
  手動で進める場合も同じようにする:

  ```bash
  git checkout -B main origin/main
  git reset --hard "$(git commit-tree 'origin/staging^{tree}' -p HEAD -p origin/staging -m 'Merge staging into main (本番ロールバック後: main を staging の内容に揃える)')"
  git push origin main
  ```

  この揃える処理で、ロールバック後に `main` へ直接入れた変更は消える。
- R2（ストレージ・限定配信）と D1（受信箱・予約など）は Git の外なので戻らない。
- `rollback-production.yml` の `main` への push は `GITHUB_TOKEN` によるため `promote-production.yml` を起動しない
  （デプロイはロールバックのワークフロー自身が行う）。


## 差分ビルドと「全て再ビルド」

CI のビルドは前回の出力を復元し、`frelio-data/site/data/_dependency-map.json`（`npm run generate:dep-map` が
レシピと `content_types/*.json` から生成）をもとに、変更の影響を受けた出力だけを作り直す。
次の更新は差分ビルドで反映される:

- 記事の追加・削除・並び順変更で、隣の記事の `prev` / `next` / `first` / `last`（detail の `navigation`。そのタイプの detail を全件作り直す）
- 別のタイプの detail や固定ページに埋め込んだ `relationList`、`expand` で埋め込んだ relation 先のコンテンツの変更
- 記事が減って一覧のページ数が減ったときの、後ろのページの削除
- `repeat`（階層の URL）の親の slug 変更・付け替え・非公開化で、子孫のページを新しい URL に作り直し、古い URL のページを削除

再生成の範囲は「変わった記事だけ」とは限らない。`navigation` を持つ detail は、そのタイプの記事を 1 件でも
追加・編集・削除すると、そのタイプの detail を全件作り直す。別タイプへの relation（カテゴリ・タグ等）や
`relationList` / `expand` を持つ detail は、参照先タイプのコンテンツが 1 件変わると全件を作り直す。
このため記事数が多いサイトでは、差分ビルドでもビルド時間が記事数に比例して伸びる。

次の場合は差分ビルドで直らないことがあるので、CMS ダッシュボードの **「全て再ビルド」** を使う:

- 一覧（list）のテンプレートを、別のレシピ（detail / 固定ページ / 別の一覧）と共有していて、ページ数が減った
- 2 段以上の入れ子の `expand`（relation 先の、さらに先のコンテンツ）を変更した
- 依存マップ（`_dependency-map.json`）を手で編集した・古い可能性がある、レシピの `outputPath` を変えた
- `repeat`（階層の URL）を持つ detail のテンプレートを、別のレシピと共有していて、親の slug を変えた・親を付け替えた
  （古い URL のページが残る）
- `repeat` の親が別タイプ（例: 商品の親がカテゴリ）で、商品の `{$href}` を別のページの `relationList` / `expand` に載せていて、
  カテゴリの slug を変えた・付け替えた（載せた側のリンクが古いまま残る）
- 生成レポート（`frelio-data/site/data/report.json`。CI ログの Summary にも出る）の `Skipped` や理由別件数から、
  作り直すべき出力が作り直されていないと分かった

## 本番向けの自動生成（sitemap.xml / robots.txt）とプレビューの noindex

本番デプロイ（`promote-production.yml` と、直接デプロイ／予約反映の `_deploy.yml`）が、デプロイ直前に
`npm run generate:sitemap` を実行して `public/sitemap.xml` を作る。**staging プレビューには出さない**
（`build-staging.yml` は生成しない。キャッシュから戻った古い `sitemap.xml` も消してからビルドする）。

- 基準 URL は `admin/config.json` の `productionUrl`（未設定なら警告を出して生成しない）。
  ローカルでは `npm run generate:sitemap`（`productionUrl` を自動で読む）/ `--base-url` / `SITE_BASE_URL` で上書き可。
- 対象は `public/` 配下の `index.html`（ディレクトリ URL）とファイルベースの詳細 `*.html`（例 `/news/foo.html`）。
  `<meta name="robots" content="noindex">` のページ（404 等）は除外する。URL は出力どおり（`.html` 付きのまま）。
- **一覧のページ送りのページ（2 ページ目以降）は載せない。** ビルドレシピ（`frelio-data/admin/recipes/build-data-recipe.json`）の
  ページネーション付き list の `outputPath`（例 `news/page/{$page}.json`）に一致する HTML（例 `/news/page/2.html`）を除外する。
  入口の 1 ページ目（`pagination.startPath` の `/news/` 等。`startPath` が無い list ではパターンの 1 ページ目）は載せる。
  レシピのパターンに一致しないページ（`news/page/` という名前の通常ページ等）は除外しない。レシピが読めないときは何も除外しない。
  - 2 ページ目以降も載せたいとき: `generate:sitemap` に `--include-paged-lists` を付けるか、環境変数 `SITEMAP_INCLUDE_PAGED_LISTS=1`。
- `public/` にある HTML を数えるため、記事を非公開にした後は、差分ビルドで残った詳細ページ（孤児 HTML）が
  sitemap に載り得る。非公開化の後は **「全て再ビルド」** をすると消える。
- `scripts/generate-sitemap.ts` または `generate:sitemap` の npm script が無いサイトではスキップする
  （生成の失敗でデプロイは止めない）。

**robots.txt**: 本番デプロイが sitemap の後に `npm run generate:robots` を実行して `public/robots.txt` を作る。

- 既定の内容は全クロール許可（`User-agent: *` / `Allow: /`）＋ `Sitemap: <productionUrl>/sitemap.xml`
  （`sitemap.xml` が生成されたときだけ）。
- **サイト側で上書きする場所**: `frelio-data/site/templates/robots.txt`（テンプレートの配置＝出力 URL の流儀）。
  このファイルがあれば生成せず、そのまま `public/robots.txt` として本番に出す（`Sitemap:` 行も自分で書く）。
- staging プレビューには robots.txt を置かない。

**プレビューの noindex**: staging / `staging-*` のプレビュー（`*.workers.dev`）は `X-Robots-Tag: noindex` を返し、
検索エンジンに載らない。

- 静的ページ: プレビューのデプロイ前に書くプレビュー専用の `public/_headers`（`build-staging.yml` は CORS と同じファイル、
  `_deploy.yml` は noindex のみ）で付ける。本番デプロイ前には `public/_headers` を消すため本番には載らない。
- Worker を経由する応答（`/storage/*`・siteMode の holding page）: コンテンツ配信 Worker（`worker/index.ts` の
  `isPreviewHost`）がホスト名で判定して付ける。本番は `workers_dev = false`（独自ドメインのみ）のため、
  `*.workers.dev` で届くリクエスト＝プレビューと判定できる。

## ビルド時の機械チェック（validate / bake:check）

staging のビルド（`build-staging.yml`、直接デプロイ／予約反映の `_deploy.yml`）が、アセットビルドの後に
`npm run validate:schema` / `validate:content` / `validate:templates`（＝`npm run validate` の中身）と
`npm run bake:check` を実行する。管理画面から保存された内容（html フィールドを `data-gen-text` で出すテンプレート、
R2 未登録の画像参照、未 bake のテンプレート等）もここで検査される。

- **既定は警告**: 失敗してもデプロイは止めない。Actions の実行画面のジョブサマリーに結果（OK / NG / SKIP と
  NG のログ末尾）が出て、アノテーション（warning）が付く。
- **失敗扱いに切り替える**: `admin/config.json` に `"buildChecks": "fail"` を書く（キーが無い・`"warn"` なら警告）。
  失敗時はジョブが失敗し、プレビュー／本番へのデプロイを止める（CMS のデプロイ状況にも失敗として出る）。
- npm script が無い検査（古い雛形のサイト）はスキップする。ローカルでは `npm run check` で同じ検査ができる。

## 依存の自動更新（Dependabot）

`.github/dependabot.yml` が `github-actions` を毎週監視し、ワークフローのアクション更新 PR を
このリポジトリに自動で立てる。ワークフローはアクションを major タグ（例: `actions/checkout@v6`）で
参照しており、patch/minor は自動追従する。PR の確認・マージは利用者の責任。
テンプレート自体を最新化したい場合は `npx @c-time/frelio-cli update --templates-only` を使う。

ビルドスクリプト（`scripts/`・`vite.config.ts`・`vite-plugins/`）も `update` の対象だが、**編集していれば保持される**
（配布時のハッシュを `.frelio/manifest.json` に記録して判定。未編集のものだけ自動更新）。編集したスクリプトに
新版を取り込むときは `--script <パス>=update`（`*.frelio-bak` に退避して上書き）、今後も上げないなら
`--script <パス>=pin`（manifest の `pinned` に入る）。`.frelio/manifest.json` はコミットしておく。
旧版のまま残っているスクリプトは `npx @c-time/frelio-cli doctor` が報告する。
