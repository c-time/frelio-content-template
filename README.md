# Frelio Content Repository Template

[Frelio](https://github.com/c-time/frelio) のコンテンツリポジトリテンプレートです。

## 使い方

### 方法 1: CLI（推奨）

```bash
npx @c-time/frelio-cli init
```

対話式プロンプトで設定を入力すると、このテンプレートをベースにプロジェクトが生成されます。

### 方法 2: GitHub Template

1. 「**Use this template**」ボタンからリポジトリを作成
2. `.hbs` ファイル内の `{{変数}}` を手動で置換
3. `.hbs` 拡張子を除去（例: `package.json.hbs` → `package.json`）

## テンプレート変数

| 変数 | 説明 | 例 |
|------|------|----|
| `{{contentRepo}}` | GitHub リポジトリ（owner/repo） | `c-time/my-site` |
| `{{githubClientId}}` | GitHub OAuth App Client ID | `Iv1.abc123` |
| `{{siteTitle}}` | サイトタイトル | `My Website` |
| `{{productionUrl}}` | 本番 URL | `https://example.com` |
| `{{previewUrl}}` | プレビュー URL | `https://staging.example.com` |
| `{{pagesProjectName}}` | Cloudflare Pages プロジェクト名 | `my-site` |
| `{{adminPagesProjectName}}` | 管理画面 Pages プロジェクト名 | `my-site-admin` |
| `{{r2BucketName}}` | R2 バケット名 | `my-site-files` |
| `{{r2PublicUrl}}` | R2 公開 URL | `https://example.com/storage` |
| `{{ownerUsername}}` | GitHub ユーザー名 | `c-time` |

## 構造

```
├── frelio-data/          # コンテンツデータ
│   ├── site/             # サイトコンテンツ（テンプレート・スキーマ）
│   └── admin/            # 管理画面設定
├── scripts/              # SSG ビルドスクリプト
├── .github/workflows/    # CI/CD ワークフロー
├── functions/            # Cloudflare Pages Functions
└── public/               # SSG 出力
```

## ライセンス

MIT
