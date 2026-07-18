#!/usr/bin/env node
/**
 * monta desktop/resources:
 * - web com VITE_API_URL="" (mesma origem)
 * - api em server.cjs
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const resources = path.join(root, 'desktop', 'resources')
const webOut = path.join(resources, 'web')
const serverOut = path.join(resources, 'server.cjs')

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    process.exit(r.status || 1)
  }
}

console.log('→ limpando desktop/resources')
rmSync(resources, { recursive: true, force: true })
mkdirSync(webOut, { recursive: true })

console.log('→ build web (same-origin)')
run('npm', ['run', 'build', '-w', 'web'], { VITE_API_URL: '' })

const webDist = path.join(root, 'web', 'dist')
if (!existsSync(path.join(webDist, 'index.html'))) {
  console.error('web/dist/index.html não encontrado')
  process.exit(1)
}
cpSync(webDist, webOut, { recursive: true })

console.log('→ bundle API → desktop/resources/server.cjs')
await build({
  entryPoints: [path.join(root, 'api', 'src', 'runServer.ts')],
  outfile: path.join(resources, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  packages: 'bundle',
  logLevel: 'info',
})

writeFileSync(
  path.join(resources, 'README.txt'),
  'Recursos gerados por npm run desktop:prepare — não editar à mão.\n',
)

console.log('→ ok')
console.log(`   UI: ${webOut}`)
console.log(`   API: ${path.join(resources, 'server.cjs')}`)
