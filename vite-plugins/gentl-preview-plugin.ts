/**
 * gentl ライブプレビュー Vite プラグイン
 *
 * dev サーバーで「リクエストURL → data-json → gentl 描画」をオンザフライ実行し、
 * include（head/header/footer）込みの実ページを返す。
 *
 * - 起動時: dep-map + data-json を生成し、初日からプレビュー可能にする
 * - 描画: data-json を gentl（@c-time/frelio-gentl）で HTML 化し、dev 用にアセット参照を調整
 * - 監視: テンプレ/data-json 変更 → full-reload、contents 変更 → data-json 再生成 → reload
 *
 * @see Issue #63
 */

import type { Plugin, ViteDevServer } from 'vite'
import { spawn, spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { generateHtml, NodeFileSystem } from '@c-time/frelio-gentl'
import type { FrelioDataJson } from '@c-time/frelio-data-json'

const TEMPLATE_ROOT = 'frelio-data/site/templates'
const DATA_JSON_ROOT = 'frelio-data/site/data/data-json'
const CONTENTS_ROOT = 'frelio-data/site/contents'

/** contents 変更後に data-json 再生成をまとめるデバウンス時間 */
const REGEN_DEBOUNCE_MS = 400

type Options = {
  /** content-repo のルート（vite.config.ts の __dirname） */
  projectRoot: string
}

/**
 * リクエストパスから data-json ファイルの候補（DATA_JSON_ROOT 相対）を返す。
 * file 式（news/foo.html）・ディレクトリ式（news/foo/）の両方に対応する。
 */
function resolveDataJsonCandidates(pathname: string): string[] {
  if (pathname === '/' || pathname === '/index.html') return ['index.json']
  const rel = pathname.replace(/^\/+/, '')
  if (pathname.endsWith('/')) return [rel + 'index.json']
  if (rel.endsWith('.html')) return [rel.replace(/\.html$/, '.json')]
  // 拡張子なし: file 式とディレクトリ式の両方を試す
  return [rel + '.json', rel + '/index.json']
}

/** dev 用に生成 HTML のアセット参照を調整する */
export function rewriteAssetsForDev(html: string): string {
  let out = html
  // ビルド済み CSS の <link>（dev では実体が無い）を、Vite が同期配信できる
  // ソース .scss?direct へ書き換える。?direct は render-blocking な生 CSS として
  // 配信されるため初回描画時の FOUC を防ぐ。
  // （link を削除して TS エントリの import だけに頼ると、type="module" スクリプトの
  //  実行時に <style> が注入されるまで無スタイルの一瞬が生じていた＝Issue #206。）
  // HMR は従来どおり TS エントリ側の `import "../styles/index.scss"` が担う
  // （?direct は HMR 対象外なので、初回描画＝?direct・以降の更新＝JS 注入で役割分担）。
  out = out.replace(
    /(<link\b[^>]*\bhref=")([^"]*\/styles\/index)\.css("[^>]*>)/g,
    '$1$2.scss?direct$3',
  )
  // ビルド済み JS を TS ソースに差し替え（Vite が dev でモジュール配信し、SCSS も HMR される）
  out = out.replace(
    /(<script\b[^>]*\bsrc=")([^"]*\/scripts\/index)\.js("[^>]*>)/g,
    '$1$2.ts$3',
  )
  // gentl 出力には DOCTYPE が含まれないため再付与する
  if (!/^\s*<!doctype/i.test(out)) {
    out = '<!DOCTYPE html>\n' + out
  }
  return out
}

/** scripts/generate-*.ts を同期実行する（起動時用） */
function runScriptSync(projectRoot: string, args: string[]): void {
  const result = spawnSync('npx', ['tsx', ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    console.error(`[gentl-preview] script failed (exit ${result.status}): ${args.join(' ')}`)
  }
}

export function gentlPreviewPlugin(opts: Options): Plugin {
  const { projectRoot } = opts
  const dataJsonRootAbs = join(projectRoot, DATA_JSON_ROOT)
  const templateRootAbs = join(projectRoot, TEMPLATE_ROOT)
  const contentsRootAbs = join(projectRoot, CONTENTS_ROOT)

  let regenerating = false
  let regenTimer: NodeJS.Timeout | null = null

  return {
    name: 'gentl-preview',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      // --- 起動時の初期生成（空配布のスキャフォールドでも初日からプレビュー可能にする） ---
      console.log('[gentl-preview] generating dependency map + data-json...')
      runScriptSync(projectRoot, ['scripts/generate-dependency-map.ts'])
      runScriptSync(projectRoot, ['scripts/generate-data-json.ts', '--full-rebuild'])

      // --- 描画ミドルウェア（Vite の静的配信より前に処理する） ---
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url || (req.method && req.method !== 'GET')) return next()
          const accept = req.headers.accept || ''
          if (!accept.includes('text/html')) return next()

          const pathname = req.url.split('?')[0].split('#')[0]
          if (pathname.startsWith('/@') || pathname.includes('/node_modules/')) {
            return next()
          }
          // アセット（.css/.js/.ts/画像 等）は Vite に委譲。.html のみページとして扱う
          const ext = extname(pathname)
          if (ext && ext !== '.html') return next()

          const dataJsonFile = resolveDataJsonCandidates(pathname)
            .map((c) => join(dataJsonRootAbs, c))
            .find((p) => existsSync(p))
          if (!dataJsonFile) return next()

          const dataJson = JSON.parse(readFileSync(dataJsonFile, 'utf-8')) as FrelioDataJson

          const result = await generateHtml({
            dataJsons: [dataJson],
            templateRootPath: TEMPLATE_ROOT,
            fileSystem: new NodeFileSystem(),
          })

          if (result.report.errors.length > 0 || result.outputs.length === 0) {
            const detail = result.report.errors
              .map((e) => `[${e.code}] ${e.outputPath}: ${e.message}`)
              .join('\n')
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(`gentl render error\n\n${detail || 'No output produced.'}`)
            return
          }

          const html = await server.transformIndexHtml(
            req.url,
            rewriteAssetsForDev(result.outputs[0].html),
          )
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (err) {
          // stale な public を返さず、エラー内容を 500 で表示する
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`gentl preview error\n\n${err instanceof Error ? err.stack ?? err.message : String(err)}`)
        }
      })

      // --- 監視と自動リロード ---
      // data-json / contents は Vite root（templates）外なので明示的に監視対象へ追加する
      server.watcher.add([dataJsonRootAbs, contentsRootAbs])

      const scheduleRegen = () => {
        if (regenTimer) clearTimeout(regenTimer)
        regenTimer = setTimeout(() => {
          regenTimer = null
          regenerating = true
          console.log('[gentl-preview] content changed -> regenerating data-json...')
          const child = spawn('npx', ['tsx', 'scripts/generate-data-json.ts', '--full-rebuild'], {
            cwd: projectRoot,
            stdio: 'inherit',
            shell: true,
          })
          child.on('close', () => {
            regenerating = false
            server.ws.send({ type: 'full-reload' })
          })
          child.on('error', (e) => {
            regenerating = false
            console.error('[gentl-preview] regeneration failed:', e.message)
          })
        }, REGEN_DEBOUNCE_MS)
      }

      const onFsEvent = (file: string) => {
        const norm = file.replace(/\\/g, '/')
        if (norm.startsWith(contentsRootAbs.replace(/\\/g, '/'))) {
          // `_` 始まりは watch-content が更新するビューインデックス/メタデータ。
          // これらの書き込みで再生成を誘発しないよう除外する。
          const base = norm.slice(norm.lastIndexOf('/') + 1)
          if (norm.endsWith('.json') && !base.startsWith('_')) scheduleRegen()
          return
        }
        // data-json 再生成中の書き込みによる多重リロードを抑止
        if (regenerating) return
        if (norm.startsWith(dataJsonRootAbs.replace(/\\/g, '/')) && norm.endsWith('.json')) {
          server.ws.send({ type: 'full-reload' })
          return
        }
        if (
          norm.startsWith(templateRootAbs.replace(/\\/g, '/')) &&
          (norm.endsWith('.htm') || norm.endsWith('.html'))
        ) {
          server.ws.send({ type: 'full-reload' })
        }
      }

      server.watcher.on('change', onFsEvent)
      server.watcher.on('add', onFsEvent)
      server.watcher.on('unlink', onFsEvent)
    },
  }
}
