/**
 * 本番ゲート middleware（Issue #93）
 *
 * コンテンツ配信 Pages のエッジで動作し、サイトの公開状態（siteMode）と
 * URL 正規化（pages.dev → 独自ドメイン 301）を制御する。
 *
 * 重要: この functions/ は管理画面 Pages にも配られる共有資産のため、
 * ホスト判定で「コンテンツのホスト」のみを対象にし、admin / staging /
 * localhost / 不明ホストは素通り（next）して CMS（/api/*）を保護する。
 *
 * 設定は wrangler.toml [vars]（context.env）から読む:
 *   SITE_MODE         live | prelaunch | maintenance | closed（既定 live）
 *   CANONICAL_HOST    正規化先ホスト（独自ドメイン。例 example.com）
 *   CONTENT_PAGES_DEV コンテンツ Pages の本番ホスト（例 mysite.pages.dev）
 */

interface GateEnv {
  SITE_MODE?: string
  CANONICAL_HOST?: string
  CONTENT_PAGES_DEV?: string
}

type GateDecision =
  | { action: 'next' }
  | { action: 'redirect'; location: string }
  | { action: 'block'; status: number }

export function decideGate(
  host: string,
  pathname: string,
  search: string,
  env: GateEnv,
): GateDecision {
  const canonical = (env.CANONICAL_HOST || '').trim()
  const pagesDev = (env.CONTENT_PAGES_DEV || '').trim()
  const mode = (env.SITE_MODE || 'live').trim()

  const isCanonical = canonical !== '' && host === canonical
  const isPagesDev = pagesDev !== '' && host === pagesDev

  // コンテンツのホスト以外（admin / staging / localhost / 不明）は素通り = CMS 保護
  if (!isCanonical && !isPagesDev) return { action: 'next' }

  // pages.dev → 独自ドメインへ 301（canonical 設定時のみ）
  if (isPagesDev && !isCanonical && canonical !== '') {
    return { action: 'redirect', location: `https://${canonical}${pathname}${search}` }
  }

  if (mode === 'live') return { action: 'next' }

  const isStorage = pathname === '/storage' || pathname.startsWith('/storage/')

  // 閉鎖: storage 含め全遮断（キルスイッチ）
  if (mode === 'closed') return { action: 'block', status: 503 }
  // プレ公開: storage 以外を 403（storage は CMS のサムネ/プレビュー用に配信継続）
  if (mode === 'prelaunch') {
    return isStorage ? { action: 'next' } : { action: 'block', status: 403 }
  }
  // メンテナンス: storage 以外を 503
  if (mode === 'maintenance') {
    return isStorage ? { action: 'next' } : { action: 'block', status: 503 }
  }

  // 未知の値は安全側（素通り）
  return { action: 'next' }
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

export const onRequest: PagesFunction<GateEnv> = async (context) => {
  const url = new URL(context.request.url)
  const decision = decideGate(url.hostname, url.pathname, url.search, context.env)

  if (decision.action === 'redirect') {
    return Response.redirect(decision.location, 301)
  }
  if (decision.action === 'block') {
    return new Response(holdingPage(decision.status), {
      status: decision.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }
  return context.next()
}
