import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const libDir = path.join(root, '.libs', 'x86_64-linux-gnu')
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(path.delimiter),
}

const child = spawn(
  'npx',
  ['playwright', 'test', '-c', 'playwright.config.ts'],
  { cwd: root, env, stdio: 'inherit', shell: true },
)

child.on('exit', (code) => process.exit(code ?? 1))
