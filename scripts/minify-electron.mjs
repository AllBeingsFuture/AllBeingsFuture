/**
 * Post-process electron/dist JS with esbuild minify (no source maps).
 * Pure size reduction; does not change control flow semantics.
 */
import { createRequire } from 'node:module'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const require = createRequire(path.join(repoRoot, 'frontend', 'package.json'))
const { build } = require('esbuild')

const root = path.join(repoRoot, 'electron', 'dist')

async function listJs(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name)
    const s = await stat(full)
    if (s.isDirectory()) out.push(...await listJs(full))
    else if (name.endsWith('.js') && !name.endsWith('.map')) out.push(full)
  }
  return out
}

const files = await listJs(root)
if (files.length === 0) {
  console.error('minify-electron: no js under', root)
  process.exit(1)
}

await Promise.all(
  files.map((entry) =>
    build({
      entryPoints: [entry],
      outfile: entry,
      allowOverwrite: true,
      bundle: false,
      minify: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'error',
    }),
  ),
)

console.log(`minify-electron: minified ${files.length} files in electron/dist`)
