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
- `docs/frelio/` — このファイルから分けた詳細ドキュメント（下記の索引）

CMS 管理画面・デプロイ関連（`admin/`（SPA）, `admin-worker/`（バンドル済み Worker）, `worker/`（コンテンツ Worker）, `workers/`, `wrangler.admin.toml`, `wrangler.content.toml`）は
`npx @c-time/frelio-cli update` で追加・更新される。

## 詳細ドキュメント（該当する作業の前に必ず読む）

このファイルには「常に守るルール」と「やりがちなミス」だけを置く。下の作業をするときは、
**着手前に該当ファイルを読むこと**（このファイルだけでは情報が足りない）。

| こんな作業のとき | 読むファイル |
|---|---|
| `staging` / `main` を手動で進める・プレビュー URL を知りたい・Dependabot・差分ビルドで更新されない（全て再ビルド） | `docs/frelio/branch-and-deploy.md` |
| sitemap.xml / robots.txt の自動生成・robots.txt の上書き・プレビューの noindex・CI の機械チェック（validate / bake:check） | `docs/frelio/branch-and-deploy.md` |
| `_parts/*.htm` を変えた・file:// でテンプレを確認したい（bake） | `docs/frelio/template-bake.md` |
| `build-data-recipe.json` を触る（outputPath・ページネーション・前後ナビ・customField） | `docs/frelio/build-recipe.md` |
| `html` フィールドのエディタ設定・本文の表／グリッド／条件付き改行／見出しの改行制御と、その CSS | `docs/frelio/layout-html-editor.md` |
| Workers の構成・404 ページ・公開状態（siteMode）・管理画面のローカル起動 | `docs/frelio/cloudflare-workers.md` |
| お問い合わせフォーム（受信箱・自動メール・Webhook・プッシュ通知） | `docs/frelio/contact-form.md`（セットアップは `workers/contact/README.md`） |
| 予約反映（指定時刻の自動公開／非公開） | `docs/frelio/scheduled-publish.md`（セットアップは `workers/scheduled-publish/README.md`） |
| ファイル限定配信（期限付きダウンロード URL のメール配信） | `workers/file-delivery/README.md` |
| 日時のタイムゾーン設定・公開日の持ち方 | `docs/frelio/dates-and-timezones.md` |
| ページごとの title / description / OGP / canonical を作る | `docs/frelio/page-meta.md` |

`AGENTS.md` / `CLAUDE.md` / `docs/frelio/` は `npx @c-time/frelio-cli update` で最新のテンプレートに更新される
（差分があれば `<file>.frelio-bak` に退避して上書き）。案件固有のメモはこれらに書かず別ファイルに置く。

## AIがやりがちなミス（作業前チェックリスト・必読）

このリポジトリで AI（および人）が繰り返しやすいミス。作業前に必ず確認すること。

### 0. デザインを作り込むとき（無機質・青基調への逸走）

- テンプレの既定色（`$color-primary: #0070f3` 等）やOS標準フォントは**仮の初期値**。確定仕様と
  誤解して踏襲しない。**見た目は自由に置き換える**（守るのは記法・構造だけ）。
- 見た目を作る前に **`frelio-data/site/DESIGN-BRIEF.md`（デザイン方針）を必ず読む**。未記入なら
  勝手に無難な既定で埋めず、まず記入・方向性の確認を促す。
- 詳細 → [デザインの自由と守るべき規則](#デザインの自由と守るべき規則作業前に必読)

### 1. テンプレート／共通パーツを編集したとき（data-gen-cloned / bake）

- `data-gen-cloned` は **gentl が自動生成する描画クローン**。**手で編集・追加・削除しない**。
- `<template data-gen-*>` ソースは **絶対に消さない**（消すと二重描画・冪等性崩壊）。動的表示は必ず
  `<template data-gen-scope>`（または `data-gen-repeat`/`data-gen-if`/`data-gen-include`）の内側に置く。
- `_parts/*.htm`（head/header/footer）を変更したら **`npm run bake`** で全ページへ伝播させる。file:// で
  クローム＋実データを確認するのは bake 後。スタイル込みの確認は `npm run dev`。
- 詳細 → `docs/frelio/template-bake.md`・[テンプレート規約](#テンプレート規約)

### 2. コンテンツに画像／ファイルを入れるとき（R2 登録）

- 画像・ファイルは **先に R2 に登録**する（CMS の「ストレージ」画面、または file-upload Worker の
  `/upload`・`/upload-set`。API 手順は Frelio 本体の [docs/external-api.md](https://github.com/c-time/frelio/blob/master/docs/external-api.md)）。**テンプレートの静的フォールバック
  （`/images/placeholder.jpg` 等）や自前の仮画像をそのまま使わない。**
- image / file フィールドの `url` には R2 の **生キー**（例: `2026/<uuid>/medium.webp`）を入れる。
  **`/storage/` は付けない**（レシピの customField が前置する）。先頭スラッシュ付きパス・ローカルパス・
  裸のファイル名は R2 未登録の疑い。
- 本文（html フィールド）に画像を貼るときは、R2 登録済みの **`/storage/...` の最終 URL** を使う。
- 迷ったら **`npm run check`**（bake 鮮度 + コンテンツ画像参照を機械チェック）で確認する。
- 詳細 → `docs/frelio/build-recipe.md` の「customField で値を組み立てる」

### 3. テンプレートで html フィールドを出すとき（data-gen-text と data-gen-html の使い分け）

- **`html` フィールドの本文は必ず `data-gen-html`（生出力）、それ以外のプレーン値は `data-gen-text`（エスケープ出力）。**
  取り違えると、公開ページに **`<p>…</p>` という生タグが文字として露出**する。
  型ごとの対応表と理由は [テンプレート規約](#テンプレート規約) にある。
- 迷ったら **`npm run validate:templates`**（`npm run validate` / `npm run check` にも含まれる）で機械チェック。
  html フィールドを `data-gen-text` で束縛していると ERROR になる。CLI からも同じ検査ができる:
  `npx @c-time/frelio-cli validate-templates`（scripts が無い既存リポでも実行可）。

### 4. 公開ページ向けの CSS がビジュアルエディタの編集を邪魔するとき（html.frelio-visual-editor）

- カード全体リンク（`::after` を `inset: 0` で全面に広げる stretched link）や全面オーバーレイは、
  ビジュアルエディタで**文字をクリックしても編集を始められない**原因になる。
- **エディタ中だけ効かせる CSS は `html.frelio-visual-editor …` で書く**（公開ページには付かない）。
  `body[contenteditable]` は実装詳細（共通パーツ編集中は `false` になる）なので目印に使わない。
- 詳細 → [ビジュアルエディタ中だけ効かせる CSS](#ビジュアルエディタ中だけ効かせる-csshtmlfrelio-visual-editor)

## ブランチモデル / ブランチルール

このリポジトリは 4 ブランチで運用する。各ブランチへの push が GitHub Actions
（`.github/workflows/`）を発火し、デプロイが自動実行される。

| ブランチ | push 時の動作 | 役割 |
|---|---|---|
| `develop` | （デプロイなし） | 通常の開発・編集作業。**ここを起点にする** |
| `admin` | `deploy-admin.yml` | 管理画面（CMS Admin）をデプロイ |
| `staging` / `staging-*` | `build-staging.yml` | SSG ビルド + プレビュー（`staging-{user}` は個人プレビュー） |
| `main` | `promote-production.yml` | 本番デプロイ |

**直接編集禁止ブランチ: `main` / `admin` / `staging`**
これらのブランチ上で直接コミットしない。`develop` の内容を進めて反映する。**進め方はブランチで違う**:

- `admin` … **fast-forward push**（`git push origin origin/develop:admin`）。
- `staging` / `main` … **マージ方式**（`git merge ... --no-edit`）。どちらもマージコミット履歴を持つため、
  fast-forward push・`git merge --ff-only` は失敗しうる。手順は `docs/frelio/branch-and-deploy.md`。

push は各デプロイを自動で発火する。

- `admin`（管理画面の反映）・`staging`（プレビュー）への反映 push は、作業に必要なら指示を待たずに行ってよい。
- `main`（本番）への push は、**明示的に指示されたときだけ**行う（下記「必須ゲート」も守る）。
- git 操作は `develop` を基点に行い、デプロイは下記フローに委ねる。

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
- 段階的に手動で進める手順（ローカル確認 → ステージングプレビュー → 本番化）・プレビュー URL・
  依存の自動更新（Dependabot）は `docs/frelio/branch-and-deploy.md`。

### 本番化は「正規ステージングプレビュー」を必須ゲートにする（厳守・issue #284）

本番（`main`）へ進める前に、**必ず「正規ルートのステージングプレビュー」**＝`staging` ブランチの
プレビュー（`staging-<contentWorkerName>.<subdomain>.workers.dev`）を**経由・目視確認**すること。

- **個人用 `staging-*`（`staging-{user}`）プレビューや、`develop` からの直行で本番化しない。**
  個人プレビューは本人作業の確認用であり、正規ステージングの代わりにはならない。
- **不変条件: `staging` は常に `main` と同等かそれより新しい**（`develop → staging → main` の順で進むため、
  `main` が `staging` より先行する状態は異常）。手動で進める場合も必ず
  **staging を更新 → 正規プレビューで確認 → main** の順を守る。
- **`main` への直接 push・`staging` を飛ばす本番化は禁止。** `direct-deploy.yml` は develop → staging → main を
  一括実行するが、これは「正規 staging を経由した」ことを担保するものではない（プレビューの目視確認は
  人間が行う）。AI は正規 staging プレビューの確認前に本番化を起動しないこと。
- CMS ダッシュボードは、`main`（本番）が正規ステージングプレビューより**先行している疑い**を検知すると
  警告バナーを表示する。表示されたら正規ルートを経ていない変更が混入していないか確認すること。

### 個人ブランチ・個人プレビューの名前（GitHub ID から作る）

- **個人ブランチ（`frelio-cms/{user}`）・個人プレビュー（`staging-{user}`）の `{user}` は GitHub ID（login）から作る。
  名前・メールアドレス・`git config user.name` などから推測した名前を使わない。**
  - CMS と同じ規則で変換する: GitHub login を小文字化し、`.` と `_` を `-` に置換（連続 `-` は 1 つに、先頭/末尾の `-` は除去）。
    例: `Taro_Yamada` → `frelio-cms/taro-yamada` / `staging-taro-yamada`
  - GitHub ID は `gh api user --jq .login` で取得するか、ユーザーに確認する。既存ブランチは
    `git ls-remote origin 'refs/heads/frelio-cms/*' 'refs/heads/staging-*'` で確認できる。
  - 規則と違う名前で作ったブランチは CMS に認識されない（CMS のブランチツリーでは「個人ブランチ未作成」のまま表示される）。

## よく使うコマンド

```bash
npm run dev                # Vite dev server（gentl ライブプレビュー: 実URL描画 + 自動リロード）
npm run dev:admin          # CMS 管理画面をローカル起動（wrangler dev、http://localhost:5173/）
npm run build              # 静的アセットコピー + SCSS/TS ビルド（ページ別エントリー）
npm run generate           # data-json 生成（差分ビルド）
npm run generate:full      # data-json 生成（フルリビルド）
npm run generate:html      # HTML 生成（data-json → public/）
npm run bake               # テンプレ焼き込み（include/repeat を解決しテンプレ自身へ書き戻し）
npm run validate:schema    # JSON 構造の検証（content_types/ui/views/recipe/contents が型に合うか・レシピの未知キーは warn、--strict で error）
npm run validate:content   # コンテンツ画像参照の検証（R2 生キー形式か・プレースホルダ流用がないか）
npm run validate:templates # テンプレートのデータ束縛の検証（html フィールドを data-gen-text で出していないか）
npm run validate           # スキーマ + 画像参照 + テンプレート束縛の検証（validate:schema + :content + :templates）
npm run check              # 総合チェック（generate → bake 鮮度検証 → validate）
npm run generate:sitemap   # sitemap.xml 生成
npm run generate:dep-map   # 依存マップ生成
npm run watch:content      # コンテンツ変更監視（インデックス自動更新）
npm run rebuild:indexes    # インデックス一括再構築
npx @c-time/frelio-cli update     # CMS Admin バンドル更新
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
├── faq/                 — /faq/
│   ├── index.html
│   ├── scripts/index.ts
│   └── styles/index.scss
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

## デザインの自由と守るべき規則（作業前に必読）

このリポジトリでの約束は「**作り方は厳守、見た目は自由**」。この2つを混同しないこと。

- **厳守（＝コードの作り方）**: 下記「CSS 記法ルール（FLOCSS 亜種）」「テンプレート規約」
  「TypeScript ルール」など**構造・記法**に関する規則。ここは一切崩さない。
- **自由（＝見た目・表情）**: 配色・タイポグラフィ・余白の密度・あしらい・装飾・
  モーション・レイアウトの構図といった**デザインそのもの**。案件に合わせて積極的に作り込む。

### 既存の色・フォント値は「決定事項」ではなく「初期プレースホルダ」

`common/styles/foundation/_variables.scss` の `$color-primary: #0070f3`（青）や
`-apple-system` のフォントスタックは、雛形の**仮の初期値**にすぎない。**これを「このサイトの
確定仕様」と誤解して踏襲しないこと。** 無難な青・OS標準フォント・均一な余白をなぞると、
どの案件も似た無機質な見た目になってしまう。デザインブリーフに従って**遠慮なく置き換える**。

### デザインを作り込む前に DESIGN-BRIEF.md を読む

案件ごとのデザイン方針は `frelio-data/site/DESIGN-BRIEF.md`（記入式）が正本。**見た目を
作る前に必ず読む。**

- ブリーフに記入がある → その世界観に**忠実に従って**作り込む（＝ここで冒険してよい／すべき）。
- ブリーフが**未記入・空欄が多い** → 勝手に無難な既定で埋めず、**まず記入・方向性の確認を促す**。
  デザインの入力が無いと安全側（無機質）に倒れるため、入力を引き出すことを優先する。

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
- **要素の中身を出すときは、フィールドの型で `data-gen-text` と `data-gen-html` を使い分ける。** 取り違えると描画が壊れる（`npm run validate:templates` で機械検出できる）:

  | フィールド型 | 使う属性 | 理由 / 誤用の症状 |
  |---|---|---|
  | `html`（WYSIWYG 本文） | **`data-gen-html`**（生出力） | エディタ（TipTap）は段落を必ず `<p>…</p>` で包んで保存する。それをそのまま描画。`data-gen-text` にすると `<p>…</p>` が**文字として露出**する |
  | `text` / `markdown` / `number` / `date` / `datetime` / `select` | **`data-gen-text`**（エスケープ） | プレーン値を安全に出力。生の入力を `data-gen-html` で無防備に生出力しない |

  属性値の束縛（`data-gen-attrs="href:item.href"` 等）はこの使い分けの対象外。
- 一覧のダミー行・詳細のダミー本文は `<template>` の内側に置く（描画クローンからは除去され、ソース上の設計参照としてのみ残る）。
- 素のブラウザ（file://）でクローム＋実データを見るには `npm run bake`（`docs/frelio/template-bake.md`）。スタイル込みの確認は `npm run dev`。
- 共通パーツ: `_parts/*.htm`（head, header, footer）。`head.htm` は共通 head（charset/viewport/共通CSS・JS）のみ。`<title>` とページ別 CSS/JS は各ページが持つ。
- ページテンプレート: `{page}/index.html`（ホームは `index.html`）
- 詳細テンプレート: `{page}/_detail/index.html`（レシピでスラッグ展開し `{page}/{slug}/index.html` へ。レシピの書き方は `docs/frelio/build-recipe.md`）

### ビジュアルエディタ中だけ効かせる CSS（`html.frelio-visual-editor`）

CMS のテンプレート ビジュアルエディタは、iframe 内の `<html>` に **`frelio-visual-editor` クラス**を付ける
（公開ページ・`npm run dev` には付かない。テンプレートにも保存されない）。サイト CSS で
「エディタで開いているときだけ」スタイルを変える公式のフックとして使う。共通パーツ（`_parts/`）の
編集中はさらに `frelio-visual-editor-part-mode` が付く。

```scss
// ビジュアルエディタでは全面リンクの疑似要素がタイトル・説明に被さり編集を始められないため外す。
// 公開ページの <html> には frelio-visual-editor が付かないので影響しない。
html.frelio-visual-editor .c-product-card__link::after {
  content: none;
}
```

- **使いどころ**: カード全体リンク（stretched link）の `::after` を外す／全面に被さるオーバーレイ・
  装飾や `pointer-events` を奪う要素を無効化する／hover でしか出ない要素・アニメーションで隠れている
  要素を編集中は表示したままにする。
- `html.frelio-visual-editor` の分だけ詳細度が上がるので、`.p-xxx .c-product-card__link::after` のような派生ルールも
  まとめて上書きできる。
- **雛形やコードにカード全体リンクを入れるときは、このルールをセットで書く。**
- **反映タイミングに注意**: エディタは CSS を「テンプレートプレビュー ベースURL」（既定はステージングの
  プレビュー）から読むため、CSS を直しても **staging に反映するまでエディタには効かない**。
- `frelio-visual-editor*` と `frelio-ve-*`（エディタ内部用）はエディタ予約のクラス名。サイト側のクラスに使わない。

## 型パッケージ活用方針

JSON ファイルの読み書きでは、以下の型・ガード・スキーマを使用する。

| ファイル | 型 | パッケージ |
|---|---|---|
| `content_types/*.json` | `ContentType` / `validateContentType` | `@c-time/frelio-types` |
| `*.ui.json` | `ContentTypeUi` / `validateContentTypeUi` | 同上 |
| `*.views.json` | `ContentTypeViews` / `validateContentTypeViews` | 同上 |
| `build-data-recipe.json` | `FrelioBuildDataRecipe` / `validateSiteRecipe` | 同上 |
| `data-json/*.json` | `FrelioDataJson` / `isFrelioDataJson` | `@c-time/frelio-data-json` |
| `contents/*/*.json` | `StoredContent` / `isStoredContent`（ファイル本体は `id` / `contentTypeId` をパス由来で持たない） | `@c-time/frelio-types` |

> これらの型検証は **`npm run validate:schema`**（`scripts/validate-schema.ts`）が全ファイルへまとめて適用する。型として正しいかの二値チェックで、生成物の追従を診る `frelio doctor`（保守フェーズ）とは責務が別。

## コンテンツの自動採番（通し番号 / 管理番号 `seq`）

各コンテンツには、コンテンツタイプ単位の連番 `seq`（管理番号）が新規作成時に自動付与される。一覧/詳細に番号のみ（一覧の列ラベルは「No」）で表示され、会話での参照に使える。

- **ユニーク性は保証しない。** 別ブランチでの並行作成・削除により重複や欠番が起こりうる、利便性・表示用の番号。**一意キーは UUID（`contentId`）。** 一意性が必要な箇所では必ず `contentId` を使うこと。

## 日付の記法（重要）

`date` 型フィールドの値は、**必ず ISO 8601 の日付形式 `YYYY-MM-DD` で記述すること**（例: `2026-06-11`）。

- `June 11, 2026` / `2026/6/1` / `2026-06-11T00:00:00.000Z` のような自由形式・別区切り・時刻付きの値は**不可**。CMS の入力欄（DatePicker）が解釈できず、保存値のバリデーションでも弾かれる。
- コンテンツ JSON を手で編集・生成する場合も同じ。`date` 型の値は `"2026-06-11"` の形にする。

### `date`（暦日）と `datetime`（日時）の使い分け

- **`date`（暦日）**: 時刻・タイムゾーンを持たない `YYYY-MM-DD`。開催日・記念日のような「日」だけを表すフィールドに使う。
- **`datetime`（日時）**: 時刻を持つ値は `datetime` 型で扱い、**オフセット付き ISO 8601 で記述する**（例: `2026-06-11T19:00:00+09:00`、UTC は `2026-06-11T10:00:00Z`）。
  - オフセットなしの裸の日時（`2026-06-11T19:00:00`）や日付だけ（`2026-06-11`）は `datetime` としては**不可**。CMS の入力欄（DateTimePicker）でもバリデーションでも弾かれる。
  - オフセット付きなので絶対時刻が一意に定まる。比較・ソートは絶対時刻（エポック）で行われる。
- 雛形の `article.publishDate` は **`datetime` 型**（入力は日時・サイトへの出力は日付のみ）。この標準パターンと、
  タイムゾーン設定（保存・UI 表示・出力の3層）は `docs/frelio/dates-and-timezones.md`。
