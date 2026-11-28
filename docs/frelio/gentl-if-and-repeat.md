# gentl の条件分岐（data-gen-if）と繰り返し（data-gen-repeat）の現行挙動

> AI コーディングアシスタント向け文書の一部。入口（必ず守るルールと索引）はリポジトリ直下の `AGENTS.md`。

テンプレートエンジン `@c-time/gentl`（1.3.4 で確認）の**実際の挙動**をまとめる。gentl 本体の README と
食い違う点があり、テンプレートを書くときは**この文書の挙動を前提にする**（本体側を直すかどうかは未定。
本体の挙動が変わったらこの文書も更新される）。

## data-gen-if の真偽判定

値を JavaScript の真偽値としてそのまま判定する（`!値` なら出さない）。

| 値 | 判定 |
|---|---|
| 未定義（キーが無い）・`null`・`false`・`0`・`""` | 偽（出さない） |
| **空配列 `[]`** | **真（出す）** |
| 空オブジェクト `{}` | 真（出す） |
| 文字列 `"false"`・`"0"` | 真（出す） |

gentl の README には「`[]` は偽／配列は `length > 0` で判定」とあるが、**現行の実装では空配列は真**。
`data-gen-if="items"` は「配列が 0 件か」ではなく「値があるか」の判定にしかならない。

### 0 件のとき見出しごと出さない（現行 gentl での書き方）

件数は `data-gen-if="items.length"` で判定する（データパスはドット区切りで `length` も参照でき、`0` は偽）。
ただし `items` が `null` のとき `items.length` は例外になり**そのページが生成されない**（`RENDER_ERROR`）。
未定義のときは偽になるが、データ参照の警告がレポートに出る。任意項目の配列（未入力の記事がありうる）は、
外側の `<template>` で値の有無を、内側の要素で件数を判定する:

```html
<template data-gen-scope="" data-gen-if="relatedItems">
  <section class="related" data-gen-if="relatedItems.length">
    <h2>関連記事</h2>
    <ul>
      <template data-gen-scope="" data-gen-repeat="relatedItems" data-gen-repeat-name="item">
        <li data-gen-text="item.title">関連記事タイトル</li>
      </template>
    </ul>
  </section>
</template>
```

- 外側の `data-gen-if="relatedItems"`: 未定義・`null` ならテンプレートの中身を一切処理しない（例外も警告も出ない）。
- 内側の `data-gen-if="relatedItems.length"`: 空配列のとき見出しごと消す。
- データが必ず配列になる（未定義・`null` にならない）と分かっているなら、`<template data-gen-scope="" data-gen-if="relatedItems.length">` 1 段でもよい。

## data-gen-repeat が失敗するとページごと生成されない

次の場合、gentl は**例外を投げ、そのページ全体が生成されない**（`generate:html` のレポートに `RENDER_ERROR`。
他のページの生成は続く。`npm run dev` のプレビューは 500 でエラー内容を表示する）。gentl の README には
「処理をスキップする」とあるが、現行の実装はスキップしない。

| 状況 | エラーメッセージ |
|---|---|
| 繰り返す対象が配列でない（未定義・`null`・文字列・オブジェクト） | `"<repeat-name の値>" is not array at data-gen-repeat` |
| `data-gen-repeat-name` が無い・空 | `data-gen-repeat depend data-gen-repeat-name` |

空配列 `[]` はエラーにならず、0 回繰り返す（何も出ない）。

### 任意項目の配列は `<template>` 自身に data-gen-if を付ける

未入力の記事がありうる配列（任意のタグ・関連リンク等）は、**繰り返す `<template>` 自身**に
`data-gen-if` を付ける。`<template>` の `data-gen-if` は繰り返しより先に評価されるので、未定義・`null` なら
繰り返しごとスキップされる:

```html
<ul>
  <template data-gen-scope="" data-gen-if="tags" data-gen-repeat="tags" data-gen-repeat-name="tag">
    <li data-gen-text="tag.name">タグ</li>
  </template>
</ul>
```

**外側の要素に付けた `data-gen-if` では回避できない。** 要素の `data-gen-if` はその中の `<template>` を
展開したあとに評価されるため、先に繰り返しが失敗する:

```html
<!-- NG: tags が未定義だと、div の判定より先に内側の繰り返しが失敗してページが RENDER_ERROR -->
<div data-gen-if="tags">
  <template data-gen-scope="" data-gen-repeat="tags" data-gen-repeat-name="tag">…</template>
</div>
```

見出しごと消したい場合は、前節の「外側の `<template>` で値の有無 → 内側の要素で件数」の形にする。

### data-gen-scope は入れ子の `<template>` にも必要

gentl が処理するのは `data-gen-scope` 属性を持つ `<template>` だけ。入れ子の `<template>` も含め、
`data-gen-repeat` / `data-gen-if` / `data-gen-include` を付けた `<template>` には必ず `data-gen-scope=""` も付ける。
付け忘れるとエラーにもならず、その `<template>` は**何も描画されない**。

## 処理順

`<template data-gen-scope>` 単位と、その中の要素単位で順序が異なる。

**`<template>` 単位**（`<template>` 1 つにつき）:

1. `data-gen-if` — 偽ならこの `<template>` を丸ごとスキップ（中身は評価されない）
2. `data-gen-comment` — 付いていればスキップ
3. `data-gen-include` — 付いていれば取り込んで描画し、ここで終わる（同じ `<template>` の `data-gen-repeat` は使われない）
4. `data-gen-repeat` — `data-gen-repeat-name` の有無 → 対象が配列か、を確認（失敗すると例外）し、要素ごとに下の「要素単位」を実行

**要素単位**（`<template>` の中身。繰り返しなら 1 件ごと。`data-gen-include` で取り込んだ中身も 2.〜7. の順）:

1. `data-gen-comment` の要素を削除
2. 入れ子の `<template data-gen-scope>` を展開（上の「`<template>` 単位」を再帰）
3. `data-gen-text`
4. `data-gen-html`
5. `data-gen-json`
6. `data-gen-attrs`
7. `data-gen-if` — 偽ならその要素を削除（中の入れ子 `<template>` は 2. で既に評価済み）
