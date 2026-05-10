import fs from 'node:fs'
import path from 'node:path'

const TEMPLATES_DIR = 'frelio-data/site/templates'
const OUTPUT_DIR = 'public'
const STATIC_DIR_NAME = 'images'
const SKIP_DIRS = new Set(['_parts', 'scripts', 'styles', 'node_modules'])

function copyStaticAssets(srcDir: string, destDir: string): number {
  let count = 0
  if (!fs.existsSync(srcDir)) return count

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue

    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === STATIC_DIR_NAME) {
        fs.cpSync(srcPath, destPath, { recursive: true })
        count++
      } else {
        count += copyStaticAssets(srcPath, destPath)
      }
    }
  }
  return count
}

const count = copyStaticAssets(TEMPLATES_DIR, OUTPUT_DIR)
if (count > 0) {
  console.log(`Copied ${count} images/ director${count === 1 ? 'y' : 'ies'} to ${OUTPUT_DIR}/`)
}
