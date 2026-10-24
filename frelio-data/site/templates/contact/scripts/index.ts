import '../styles/index.scss'

/**
 * お問い合わせフォーム
 *
 * frelio-contact ワーカー（form.dataset.contactApi）に対して:
 *  1. GET /config で Turnstile サイトキーを取得し、ウィジェットを明示レンダリング
 *  2. 送信時に POST /submit（fields/labelMapping/sourceUrl/turnstileToken）
 *
 * data-contact-api 未設定時はフォームを無効化し、未設定メッセージを表示する。
 * data-contact-form-id を指定すると payload.formId として送信し、フォーム単位で
 * 自動メール／限定配信ルールを出し分けられる（未指定時はサーバ側で既定 'contact'）。
 * data-delivery-file-ids（JSON 配列 or カンマ区切りの fileId 群）を指定すると
 * payload.requestedFileIds として送信し、配信モード 'request' のメールルールが
 * その製品の配布ファイルを期限付きリンクで自動配信する（製品ページ側で SSG が埋め込む想定）。
 */

type TurnstileRenderOptions = {
  sitekey: string
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
}

type TurnstileApi = {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  getResponse: (widgetId?: string) => string | undefined
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

function setStatus(el: HTMLElement, message: string, kind: 'info' | 'success' | 'error'): void {
  el.textContent = message
  el.dataset.kind = kind
}

type LabelMap = Array<{ label: string; name: string }>

/** フォーム内の name 付き入力をすべて収集（Turnstile トークンは除外） */
function collectFields(form: HTMLFormElement): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [key, value] of new FormData(form).entries()) {
    if (key.startsWith('cf-turnstile')) continue
    const str = typeof value === 'string' ? value : ''
    fields[key] = key in fields ? `${fields[key]}, ${str}` : str
  }
  return fields
}

/**
 * 限定配信の対象 fileId 群を取得（data-delivery-file-ids）。
 * JSON 配列文字列（例: ["files/uuid1","files/uuid2"]）を優先し、
 * 失敗時はカンマ区切りとして解釈する。空なら []。
 * 形式/実在検証はサーバ（配信ワーカーの mint）が行うため、ここでは軽い正規化のみ。
 */
function readRequestedFileIds(form: HTMLFormElement): string[] {
  const raw = (form.dataset.deliveryFileIds ?? '').trim()
  if (!raw) return []
  let list: unknown[] = []
  try {
    const parsed = JSON.parse(raw) as unknown
    list = Array.isArray(parsed) ? parsed : []
  } catch {
    list = raw.split(',')
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of list) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/**
 * 表示ラベルマッピングを取得。
 * 1) <script type="application/json" data-contact-label-mapping> があれば優先
 * 2) 無ければ <label for> から DOM 順で自動生成
 */
function readLabelMapping(form: HTMLFormElement): LabelMap {
  const tag = form.querySelector('script[data-contact-label-mapping]')
  if (tag?.textContent) {
    try {
      const parsed = JSON.parse(tag.textContent) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (m): m is { label: string; name: string } =>
            !!m && typeof m === 'object' && typeof (m as { label?: unknown }).label === 'string' && typeof (m as { name?: unknown }).name === 'string',
        )
      }
    } catch {
      // フォールバックへ
    }
  }
  // フォールバック: ラベルと入力の対応を DOM 順で導出
  const map: LabelMap = []
  for (const label of Array.from(form.querySelectorAll('label[for]'))) {
    const input = form.querySelector(`#${(label as HTMLLabelElement).htmlFor}`) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
    if (input?.name) {
      map.push({ label: (label.textContent ?? input.name).trim(), name: input.name })
    }
  }
  return map
}

/** Turnstile スクリプトの読み込みを待つ */
function waitForTurnstile(timeoutMs = 10000): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }
    const start = Date.now()
    const timer = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timer)
        resolve(window.turnstile)
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(timer)
        reject(new Error('Turnstile failed to load'))
      }
    }, 100)
  })
}

async function initContactForm(): Promise<void> {
  const form = document.getElementById('contact-form') as HTMLFormElement | null
  if (!form) return

  const status = document.getElementById('contact-status') as HTMLElement
  const submitButton = document.getElementById('contact-submit') as HTMLButtonElement
  const turnstileContainer = document.getElementById('contact-turnstile') as HTMLElement

  const api = (form.dataset.contactApi ?? '').trim().replace(/\/+$/, '')
  if (!api) {
    setStatus(status, 'お問い合わせの送信先が未設定です。サイト管理者にお問い合わせください。', 'info')
    submitButton.disabled = true
    return
  }

  // Turnstile サイトキーを取得してウィジェットをレンダリング
  let widgetId: string | undefined
  try {
    const [config, turnstile] = await Promise.all([
      fetch(`${api}/config`).then((r) => {
        if (!r.ok) throw new Error('config fetch failed')
        return r.json() as Promise<{ turnstileSiteKey: string }>
      }),
      waitForTurnstile(),
    ])
    widgetId = turnstile.render(turnstileContainer, { sitekey: config.turnstileSiteKey })
  } catch {
    setStatus(status, 'スパム対策の初期化に失敗しました。時間をおいて再度お試しください。', 'error')
    submitButton.disabled = true
    return
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    setStatus(status, '', 'info')

    const token = window.turnstile?.getResponse(widgetId)
    if (!token) {
      setStatus(status, 'スパム対策の確認を完了してください。', 'error')
      return
    }

    // data-contact-form-id があれば formId として送る（フォーム単位のルール出し分け用）
    const formId = (form.dataset.contactFormId ?? '').trim()
    const payload: Record<string, unknown> = {
      fields: collectFields(form),
      labelMapping: readLabelMapping(form),
      sourceUrl: window.location.href,
      turnstileToken: token,
    }
    if (formId) payload.formId = formId

    // data-delivery-file-ids があれば requestedFileIds として送る（request モードのルールが配信）
    const requestedFileIds = readRequestedFileIds(form)
    if (requestedFileIds.length > 0) payload.requestedFileIds = requestedFileIds

    submitButton.disabled = true
    setStatus(status, '送信中...', 'info')

    try {
      const res = await fetch(`${api}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `送信に失敗しました (${res.status})`)
      }
      form.reset()
      window.turnstile?.reset(widgetId)
      setStatus(status, 'お問い合わせを送信しました。ありがとうございます。', 'success')
    } catch (err) {
      setStatus(status, `送信に失敗しました: ${(err as Error).message}`, 'error')
      window.turnstile?.reset(widgetId)
    } finally {
      submitButton.disabled = false
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initContactForm())
} else {
  void initContactForm()
}
