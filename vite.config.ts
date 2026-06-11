import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { gentlPreviewPlugin } from './vite-plugins/gentl-preview-plugin'

const root = resolve(__dirname, 'frelio-data/site/templates')

/** dev server 起動時にコンテンツ変更監視を自動開始する Vite プラグイン */
function contentWatcherPlugin(): Plugin {
  let watcher: ChildProcess | null = null
  return {
    name: 'content-watcher',
    apply: 'serve',
    configureServer(server) {
      watcher = spawn('npx', ['tsx', 'scripts/watch-content.ts'], {
        cwd: resolve(__dirname),
        stdio: 'inherit',
        shell: true,
      })
      watcher.on('error', (err) => {
        console.error('[content-watcher] Failed to start:', err.message)
      })
      server.httpServer?.on('close', () => {
        watcher?.kill()
      })
    },
    buildEnd() {
      watcher?.kill()
      watcher = null
    },
  }
}

/** ビルド時に CSS を対応する JS チャンクのパスに合わせて styles/ 配下へ配置する */
function cssRelocatePlugin(): Plugin {
  return {
    name: 'css-relocate',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const renames: Array<{ chunkName: string; oldCss: string; newCss: string }> = []

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        const meta = (chunk as any).viteMetadata as
          | { importedCss?: Set<string> }
          | undefined
        if (!meta?.importedCss?.size) continue

        const newCss = chunk.name.replace(/(^|\/)scripts\//, '$1styles/') + '.css'
        for (const oldCss of meta.importedCss) {
          if (oldCss !== newCss) {
            renames.push({ chunkName: chunk.name, oldCss, newCss })
          }
        }
      }

      for (const { oldCss, newCss } of renames) {
        const asset = bundle[oldCss]
        if (!asset) continue
        delete bundle[oldCss]
        asset.fileName = newCss
        bundle[newCss] = asset
      }

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        const meta = (chunk as any).viteMetadata as
          | { importedCss?: Set<string> }
          | undefined
        if (!meta?.importedCss) continue
        for (const { oldCss, newCss } of renames) {
          if (meta.importedCss.has(oldCss)) {
            meta.importedCss.delete(oldCss)
            meta.importedCss.add(newCss)
          }
        }
      }
    },
  }
}

export default defineConfig(({ command }) => ({
  root: 'frelio-data/site/templates',
  publicDir: command === 'serve' ? resolve(__dirname, 'public') : false,
  plugins: [
    gentlPreviewPlugin({ projectRoot: __dirname }),
    contentWatcherPlugin(),
    cssRelocatePlugin(),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        loadPaths: [resolve(root, 'common/styles')],
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'public'),
    emptyOutDir: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        'common/scripts/index':  resolve(root, 'common/scripts/index.ts'),
        'scripts/index':         resolve(root, 'scripts/index.ts'),
        'about/scripts/index':   resolve(root, 'about/scripts/index.ts'),
        'contact/scripts/index': resolve(root, 'contact/scripts/index.ts'),
        'news/scripts/index':    resolve(root, 'news/scripts/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  server: {
    open: '/',
  },
}))
