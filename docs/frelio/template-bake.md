# テンプレート焼き込み（bake / サーバー無しプレビュー）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

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
- **本番 HTML にも `<template>` が残るのは仕様**: 実ビルド（`generate:html`）の `public/` 出力にも
  `<template data-gen-*>` の原文と `data-gen-*` 属性がそのまま残る。不具合ではないので、消す処理を足さないこと。
- **代表データ**: detail テンプレ（多数の記事が共有）は代表1件を焼き込む。既定は最新（`--pick latest`）、
  `--pick first` で先頭に切替可。実ビルド（`generate:html`）は各記事分を正しく生成するので影響しない。
- **アセット**: 焼き込みテンプレは `/styles/...`・`/scripts/...` を絶対パスで参照するため、file:// 直開きでは
  CSS/JS は読み込まれない（構造＋クローム＋実データは見える・無スタイル）。スタイル込みの確認は `npm run dev`
  のライブプレビューを使う。

## 管理画面のビジュアルエディタと bake

管理画面のビジュアルエディタはテンプレートの原文を描画し、`data-gen-include` を自分では展開しない。
そのため **未 bake のテンプレートは、共通パーツ内の CSS（`_parts/head.htm` の共通スタイル）・ヘッダー・
フッターが表示されない**（無スタイル／クローム無しに見える）。移行で原文を流し込んだ直後や、
`frelio init` 直後の雛形はこの状態になりやすい。

エディタは未 bake の include を検知すると、画面上部に「未 bake」の案内を出す。出たら
`npm run generate && npm run bake` を実行してコミットし、`develop` へ push する（エディタは `develop` の
テンプレートを読む）。

同じ場所に、CSS を読み込めないときの案内も出る。切り分けは次のとおり。

| 症状 | 一次原因 | 直し方 |
|---|---|---|
| 共通の CSS・ヘッダー・フッターだけ出ない | 未 bake | `npm run generate && npm run bake` → コミット |
| CSS が全部出ない | プレビューのベース URL が未設定／不達 | 管理画面「基本設定」→「テンプレートプレビュー ベースURL」に staging の URL |
| 一部の CSS だけ出ない | その CSS が staging に未反映／パス誤り | staging へ反映する・パスを直す |

ベース URL は、`staging` へ push して `build-staging.yml` が通ると、空の場合に限り実際の staging URL で
自動補完される（`develop` の `admin/config.json` へコミットされる）。

> CLI からも実行できる: `npx @c-time/frelio-cli bake`（既存サイト向け。雛形の `npm run bake` と同一処理）。
