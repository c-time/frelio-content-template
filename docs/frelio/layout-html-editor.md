# レイアウト対応 HTML エディタ（表・レイアウトグリッド）

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

`html` フィールドの本文は、シンプル WYSIWYG と**レイアウト対応エディタ**を切り替えて使える。
種別は**データ型ではなく UI 設定**（ui.json の `htmlEditor`）として保存される（`FieldDefinition.type` は `html` のまま・
出力は生 HTML なので SSG は無改修）。CMS ではフィールドの「タイプ」選択で決まる（「リッチテキスト（HTML）」＝`simple`／
「レイアウトHTML（表・段組）」＝`layout`／「見出し（改行制御）」＝`title`。UI 設定にエディタの選択欄は無い）。

## 有効化（`{id}.ui.json`）

```jsonc
{ "key": "body", "label": "本文", "htmlEditor": "layout" }  // "simple"（既定）| "layout" | "title"（見出し専用・後述）
```

`"layout"` にすると、表・レイアウトグリッド（12分割）・図（figure）・条件付き改行・見出しが使えるようになる。

## 出力 HTML と CSS 契約（重要）

出力は `frelio-` 名前空間の固定クラス＋**インライン CSS 変数**。span・gap・列幅・揃えはすべて
インラインで効くので、**サイト側は内容によらない少量の固定 CSS を1回用意するだけ**でよい。

- **レイアウトグリッド**: `<div class="frelio-grid" style="--fg-row-gap;--fg-col-gap">` >
  `<div class="frelio-grid-row">` > `<div class="frelio-grid-item" style="--fg-span:6;--fg-span-sp:12">`。
  12分割・等分。`--fg-span`=PC の占有列数、`--fg-span-sp`=スマホの占有列数（合計 12 超で折り返し）。
- **表**: 素の `<table>` ＋ 列幅 `<colgroup>`（%/px）、セル `text-align`/`vertical-align`、
  見出し `<th>`、結合 `colspan`/`rowspan`。
- **条件付き改行（スマホ/PC改行）**: 本文中の改行 `<br>` にクラスを付けられる。CMS の本文エディタ
  では改行位置に ↵ バッジが出て、クリックでクラスを付与できる（テンプレートのビジュアルエディタでも
  同じことができる）。**標準クラスは `sp`（スマホのみ改行）と `pc`（PCのみ改行）**。出力は素の
  `<br class="sp">` / `<br class="pc">` なので、**改行を画面幅で出し分けるのはサイト側 CSS の役割**。
  → サンプル（記事本文）:
  ```html
  <p>スマホでは、ここで改行<br class="sp">して読みやすく。</p>
  <p>PCでは、ここで改行<br class="pc">してレイアウトを整える。</p>
  ```
- これらの基本 CSS は `common/styles/project/_p-article.scss`（`.p-article__body` 配下）に**同梱済み**。
  グリッドはモバイルファースト（既定はスマホ span、`@media(min-width:768px)` で PC span）。
  条件付き改行も同様にモバイルファースト（既定で `.pc` を非表示、タブレット以上で `.sp` を非表示／`.pc` を表示）。
  `sp` / `pc` 以外のクラス名を使いたいときは、本文エディタの `brClasses`（`{id}.ui.json`）に候補を足し、
  対応する出し分け CSS を `_p-article.scss` に書く。

## テーマ（`data-component-theme`）

開発者が CSS を作り込み、編集者はグリッドブロックに**テーマを選ぶだけ**で見た目を切り替えられる。

1. `{id}.ui.json` に候補を列挙（**未設定ならテーマ選択 UI は出ない**）:
   ```jsonc
   { "key": "body", "htmlEditor": "layout",
     "gridThemes": [ { "value": "card", "label": "カード" } ] }
   ```
2. 選ぶとブロックに `data-component-theme="card"` が付く。`_p-article.scss` に属性セレクタで装飾を書く:
   ```scss
   .p-article__body [data-component-theme="card"] .frelio-grid-item { /* … */ }
   ```
   `value` は CSS セレクタと一致させる。テーマはレイアウトグリッド単位（表・図は対象外）。

## 見出し専用エディタ（`htmlEditor: "title"`・日本語の改行制御）

見出し（H1 など）を**日本語の自然な位置で折り返す**ためのエディタ。扱えるのは文字と改行だけ:
`<br>`（必ず改行。`sp` / `pc` クラスで条件付き改行も可）と `<wbr>`（改行候補）。太字・リンク・段落分けは持たない。

- **使い方**: プレーンな `title`（text。`<title>`・OGP・一覧用）はそのまま残し、表示用に別フィールド
  （例 `titleDisplay`、type `html`）を足して ui.json で `"htmlEditor": "title"` を指定する
  （コンテンツタイプ編集画面ではフィールド種別「見出し（改行制御）」）。
- **保存値**: `<p>` で包まないインライン HTML（例 `日本語の<wbr>自然な<br class="sp">改行`）。
  テンプレートの `<h1 data-gen-html="…">` へそのまま流し込める。
- **編集機能**: ヘッダーは **`title` フィールドからの取り込み**（取り込みと同時に BudouX で文節へ改行候補を
  入れる）・**改行をすべて消す**（消しゴム。`<br>` / `<wbr>` を全部外して文字だけにする）・スマホ / PC 切替・
  幅スライダーだけ（すべてアイコン）。改行は Enter で入れ、↵ / wbr バッジから種別（br ⇔ wbr）・クラスの切替と、
  その改行の削除を行う。取り込み元が無いフィールド（`title` 自体に使う場合）は、取り込みの代わりに
  「文節に改行候補を入れる」ボタンを出す。**入力欄がそのまま折り返しプレビュー**になる
  （指定幅・サイトと同じ CSS で表示。改行バッジは幅を取らない目印として行の下に出す）。
  `brClasses` 未設定でも `sp` / `pc` を候補に出す。
- **CSS 契約**: 見出しに `word-break: keep-all; overflow-wrap: anywhere;` を当てる。日本語が文字単位では
  折り返されなくなり、`<wbr>` の位置でだけ折り返す（`<wbr>` が無い長い見出しは `anywhere` がはみ出しを防ぐ）。
  条件付き改行は本文と同じ `br.sp` / `br.pc` の `display` 切替。
- **未入力時のフォールバック**: gentl には否定条件が無いため、レシピの customField で
  「表示用が空ならエスケープ済みタイトル」を作る（`fallbackSource`）:

  ```json
  { "field": "titleEscaped", "source": "{$this.title}", "type": "escape" },
  { "field": "titleHtml", "source": "{$this.titleDisplay}", "type": "string", "fallbackSource": "{$this.titleEscaped}" }
  ```

  テンプレートは `<h1 class="p-article__title" data-gen-html="titleHtml">`。
- **本文の見出し（H2〜）**: 本文エディタの見出し内でも ↵ バッジから `<wbr>` を入れられる。CSS を当てるだけでよい。

雛形は `article` の `titleDisplay`・詳細テンプレ（`news/_detail/index.html`）・`_p-article.scss` に実例を同梱している。
