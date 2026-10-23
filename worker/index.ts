/**
 * コンテンツ配信 Worker（Cloudflare Workers / Static Assets）
 *
 * 役割:
 *   - 静的アセット（SSG 出力 public/）を [assets] バインディング（ASSETS）から配信
 *   - /storage/* を R2 から配信
 *   - サイト公開状態（siteMode）に応じた holding page の制御
 *
 * ルーティング（wrangler.content.toml の [assets] と対応）:
 *   - run_worker_first = ["/storage/*"] のとき /storage/* のみ本 Worker を経由し R2 から配信。
 *     静的ページは Worker を経由せず直接配信する（live 時の通常運用）。
 *   - 非 live 時は wrangler 側で run_worker_first = true とし、本 Worker が全リクエストを受けて
 *     holding page を返す。
 *
 * siteMode は ./site-mode.ts の SITE_MODE 定数で制御する（`frelio-cli set-mode` 後の再デプロイで反映）。
 */

import { SITE_MODE } from './site-mode.js'

interface Env {
  ASSETS: Fetcher
  R2: R2Bucket
}

type SiteModeDecision = { action: 'serve' } | { action: 'block'; status: number }

/**
 * siteMode に基づく配信可否を判定する。
 *   live        : 常に配信
 *   prelaunch   : /storage 以外を 403（/storage は CMS のサムネ/プレビュー用に配信継続）
 *   maintenance : /storage 以外を 503（/storage は配信継続）
 *   closed      : storage 含め全遮断（503・キルスイッチ）
 *   未知の値     : 安全側で配信
 */
export function decideSiteMode(mode: string, pathname: string): SiteModeDecision {
  if (mode === 'live') return { action: 'serve' }

  const isStorage = pathname === '/storage' || pathname.startsWith('/storage/')

  if (mode === 'closed') return { action: 'block', status: 503 }
  if (mode === 'prelaunch') {
    return isStorage ? { action: 'serve' } : { action: 'block', status: 403 }
  }
  if (mode === 'maintenance') {
    return isStorage ? { action: 'serve' } : { action: 'block', status: 503 }
  }

  return { action: 'serve' }
}

function holdingPage(status: number): string {
  const title = status === 403 ? '公開準備中' : 'メンテナンス中'
  const message =
    status === 403
      ? 'このサイトは現在準備中です。公開までしばらくお待ちください。'
      : 'ただいまメンテナンス中です。しばらく経ってから再度アクセスしてください。'
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh; margin: 0; align-items: center; justify-content: center; background: #f5f5f5; color: #333; }
  .box { text-align: center; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #666; }
</style>
</head>
<body>
  <div class="box"><h1>${title}</h1><p>${message}</p></div>
</body>
</html>
`
}

/** <img>/<video> 等でインライン表示しても同一オリジンでスクリプト実行できない安全な型。 */
const INLINE_SAFE_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon',
  'video/mp4', 'video/webm', 'video/ogg',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
  'application/pdf',
])

/**
 * R2 オブジェクトの配信ヘッダを組み立てる。
 *
 * アップロード者は Content-Type を任意に指定できる（file-upload Worker は
 * クライアント指定の MIME をそのまま R2 に保存する）。保存値を無検証で
 * そのまま返すと、`text/html` や `image/svg+xml` が公開サイトと同一オリジンで
 * アクティブなドキュメントとして実行され得る（stored XSS）。
 *
 * サブリソース読み込み（`<img src>` 等）は Content-Disposition を無視するため
 * インライン画像は壊さず、トップレベルで直接開かれたときだけ無害化する。
 */
export function buildStorageHeaders(object: Pick<R2ObjectBody, 'httpMetadata' | 'httpEtag'>): Headers {
  const headers = new Headers()
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', object.httpEtag)
  // MIME スニッフィングによる型昇格を常に禁止する。
  headers.set('X-Content-Type-Options', 'nosniff')

  const stored = (object.httpMetadata?.contentType || '').split(';')[0].trim().toLowerCase()

  if (INLINE_SAFE_CONTENT_TYPES.has(stored)) {
    headers.set('Content-Type', stored)
    return headers
  }

  if (stored === 'image/svg+xml') {
    // SVG は <img> では描画できるが、直接ナビゲーションではスクリプトが走り得る。
    // 型は維持しつつ attachment＋sandbox でドキュメントとしての実行を封じる。
    headers.set('Content-Type', 'image/svg+xml')
    headers.set('Content-Disposition', 'attachment')
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
    return headers
  }

  // text/html・XML・不明な型はアクティブ化させない（octet-stream + 強制ダウンロード）。
  headers.set('Content-Type', 'application/octet-stream')
  headers.set('Content-Disposition', 'attachment')
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
  return headers
}

/** /storage/* を R2 から配信する */
async function serveStorage(pathname: string, env: Env): Promise<Response> {
  const raw = pathname.slice('/storage/'.length)
  let key = raw
  try {
    key = decodeURIComponent(raw)
  } catch {
    // 不正なエンコードはそのまま扱う
  }

  if (!key) {
    return new Response('Not Found', { status: 404 })
  }

  // Frelio 内部メタ（インデックス等）は公開配信しない（issue #264）。
  if (isInternalStorageKey(key)) {
    return new Response('Not Found', { status: 404 })
  }

  const object = await env.R2.get(key)
  if (!object) {
    return new Response('Not Found', { status: 404 })
  }

  return new Response(object.body, { status: 200, headers: buildStorageHeaders(object) })
}

/**
 * Frelio 内部メタ（インデックス等）の予約キーか。`/storage/*` で公開配信しない（issue #264）。
 *  - `_` 始まり（`_meta/index.<year>.json` / `_meta/unmanaged.json` 等の予約プレフィックス）
 *  - 旧年インデックス `<year>/files.json`（後方互換で残存し得る）
 */
function isInternalStorageKey(key: string): boolean {
  return key.startsWith('_') || /^\d{4}\/files\.json$/.test(key)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // siteMode ゲート（焼き込み定数）。非 live のときのみ holding page を返す。
    // live 時は wrangler の run_worker_first=["/storage/*"] により本 Worker はページに介在しない。
    const decision = decideSiteMode(SITE_MODE, url.pathname)
    if (decision.action === 'block') {
      return new Response(holdingPage(decision.status), {
        status: decision.status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }

    // /storage/* は R2 から配信（run_worker_first で本 Worker に到達する）
    if (url.pathname === '/storage' || url.pathname.startsWith('/storage/')) {
      return serveStorage(url.pathname, env)
    }

    // それ以外は静的アセット（SSG 出力）を配信
    return env.ASSETS.fetch(request)
  },
}
