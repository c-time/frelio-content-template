# 日時のタイムゾーン設定と公開日の標準パターン

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

`date` / `datetime` の値の書式ルールは `AGENTS.md` の「日付の記法」が正本。ここはタイムゾーンと設計パターン。

## タイムゾーン設定（3層）

日時のタイムゾーンは用途別に3か所で設定する。値はオフセット付きで自己記述的なので、各層で別の TZ を使っても絶対時刻は壊れない（表示・文字列化だけの話）。

1. **保存TZ（サイト全体）** — CMS の「基本設定」→「タイムゾーン」。`admin/config.json` の `saveTimezone`。`createdAt`/`updatedAt`/`publishedAt` や `datetime` を保存するときに付けるオフセット。テンプレート初期値は `+09:00`（日本）。未設定は UTC。
2. **UI表示TZ（編集画面）** — 各 `datetime` フィールドの「UI設定」→「表示タイムゾーン」（`{id}.ui.json` の `displayTimezone`）。フィールドで未指定なら **保存TZ** にフォールバック。
3. **出力TZ（ビルドデータレシピ）** — `admin/recipes/build-data-recipe.json`。トップレベルの `outputTimezone`（既定、テンプレート初期値 `+09:00`）＋ 各 `customFields` の `date` 整形での `timezone`（個別上書き）。フィールド未指定ならレシピ既定、それも無ければ UTC。

> 暦日（`date` 型）は時刻・TZ を持たないため、上記の TZ 設定の対象外（`YYYY-MM-DD` のまま）。


## 標準パターン: 公開日は datetime 入力・date 出力

テンプレートの `article.publishDate`（`datetime` 型）はこのパターンを採用している（よくある構成）。

- **入力**: `datetime` 型。時刻まで持つので、同じ日でも投稿時刻で新しい順に並べられる。
- **出力**: ビルドデータレシピの `customFields` で `date`（`format: "YYYY-MM-DD"`）に整形し、サイトには**日付のみ**を出す。
- **並び順**: レシピの `sort` は生の `publishDate`（datetime）に対して効くため、整形（日付のみ表示）とは独立して**時刻まで含めた絶対時刻**で並ぶ。

時刻も併せて表示したいフィールドは、整形 `format` を `"YYYY-MM-DD HH:mm"` などにすればよい。
