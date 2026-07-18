#!/usr/bin/env node
/**
 * sobe o bundle desktop sem .exe.
 * tenta Electron; no WSL sem lib gráfica, cai no browser.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktopDir = path.join(root, 'desktop')
const resources = path.join(desktopDir, 'resources')
const serverEntry = path.join(resources, 'server.cjs')
const webDir = path.join(resources, 'web')

const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.BUSCA_VAGAS_PORT || 8787)
const dataDir =
  process.env.BUSCA_VAGAS_DATA_DIR ||
  path.join(os.homedir(), '.config', 'Busca Vagas', 'data')

function runPrepare() {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'prepare-desktop.mjs')], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status || 1)
}

function isWsl() {
  try {
    const release = fs.readFileSync('/proc/version', 'utf8').toLowerCase()
    return release.includes('microsoft') || release.includes('wsl')
  } catch {
    return false
  }
}

function waitForHealth(timeoutMs = 45_000) {
  const url = `http://${API_HOST}:${API_PORT}/health`
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`API não respondeu a tempo (${url})`))
        return
      }
      setTimeout(tick, 250)
    }
    tick()
  })
}

function healthOk() {
  return new Promise((resolve) => {
    const req = http.get(`http://${API_HOST}:${API_PORT}/health`, (res) => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

/** porta ocupada mesmo sem /health (tipo Docker) */
function portBusy() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: API_HOST, port: API_PORT }, () => {
      sock.end()
      resolve(true)
    })
    sock.on('error', () => resolve(false))
    sock.setTimeout(1000, () => {
      sock.destroy()
      resolve(false)
    })
  })
}

function freePort() {
  // Mata o server.cjs anterior do desktop:dev (não o Docker — esse costuma não ser node server.cjs)
  const listed = spawnSync('fuser', [`${API_PORT}/tcp`], {
    encoding: 'utf8',
    shell: false,
  })
  const out = `${listed.stdout || ''}${listed.stderr || ''}`
  const pids = [...out.matchAll(/\d+/g)].map((m) => Number(m[0])).filter(Boolean)
  for (const pid of pids) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (cmd.includes('server.cjs') || cmd.includes('desktop-dev')) {
        console.log(`→ encerrando processo antigo na porta ${API_PORT} (pid ${pid})`)
        process.kill(pid, 'SIGTERM')
      }
    } catch {
      /* pid sumiu */
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function startBrowserMode() {
  if (!fs.existsSync(serverEntry) || !fs.existsSync(path.join(webDir, 'index.html'))) {
    console.error('resources ausentes — rode npm run desktop:prepare')
    process.exit(1)
  }

  fs.mkdirSync(dataDir, { recursive: true })

  console.log('')
  console.log('→ modo navegador (Electron indisponível neste ambiente)')
  console.log(`   UI:  http://${API_HOST}:${API_PORT}/`)
  console.log(`   dados: ${dataDir}`)
  console.log('   Ctrl+C para parar')
  console.log('')

  if (await portBusy()) {
    freePort()
    await sleep(600)
  }

  if (await healthOk()) {
    console.log(`→ servidor ainda ativo em http://${API_HOST}:${API_PORT}/ — abra no navegador (hard refresh)`)
    return
  }

  if (await portBusy()) {
    console.error(
      `Porta ${API_PORT} ocupada (ex.: Docker busca-vagas-api) e não responde /health.`,
    )
    console.error(
      `Pare com: docker stop busca-vagas-api   ou use: BUSCA_VAGAS_PORT=8788 npm run desktop:dev`,
    )
    process.exit(1)
  }

  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      API_HOST,
      API_PORT: String(API_PORT),
      BUSCA_VAGAS_DATA_DIR: dataDir,
      BUSCA_VAGAS_STATIC_DIR: webDir,
      CORS_ORIGINS: `http://${API_HOST}:${API_PORT},http://localhost:${API_PORT}`,
    },
    stdio: 'inherit',
  })

  const stop = () => {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  child.on('exit', (code) => process.exit(code ?? 0))

  try {
    await waitForHealth()
    console.log(`→ pronto: http://${API_HOST}:${API_PORT}/`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    stop()
    process.exit(1)
  }
}

function tryElectron() {
  return new Promise((resolve) => {
    const child = spawn('npm', ['start', '-w', 'desktop'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stderr = ''
    child.stderr?.on('data', (buf) => {
      const text = String(buf)
      stderr += text
      process.stderr.write(buf)
    })
    child.stdout?.on('data', (buf) => process.stdout.write(buf))

    child.on('exit', (code) => {
      const missingLib =
        /libnspr4\.so|cannot open shared object|error while loading shared libraries/i.test(
          stderr,
        )
      resolve({ ok: code === 0, missingLib, code: code ?? 1 })
    })
  })
}

runPrepare()

if (isWsl() || process.env.BUSCA_VAGAS_DESKTOP_BROWSER === '1') {
  await startBrowserMode()
} else {
  const result = await tryElectron()
  if (!result.ok && result.missingLib) {
    await startBrowserMode()
  } else if (!result.ok) {
    process.exit(result.code)
  }
}
