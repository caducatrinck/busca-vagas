import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

function resolveLogsDir() {
  if (process.env.BUSCA_VAGAS_LOGS_DIR) {
    return process.env.BUSCA_VAGAS_LOGS_DIR
  }

  try {
    return path.join(app.getPath('userData'), 'logs')
  } catch {
    /* app path not ready yet */
  }

  if (process.env.BUSCA_VAGAS_DATA_DIR) {
    return path.join(path.dirname(process.env.BUSCA_VAGAS_DATA_DIR), 'logs')
  }

  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Busca Vagas', 'logs')
  }

  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'Busca Vagas', 'logs')
  }

  return path.join(
    process.env.HOME || process.cwd(),
    '.config',
    'Busca Vagas',
    'logs',
  )
}

function ensureLogFile() {
  const dir = resolveLogsDir()
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'electron.log')
}

function formatArg(value) {
  if (value instanceof Error) {
    return `${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function logElectron(level, message, extra) {
  const line = [
    new Date().toISOString(),
    `[${level}]`,
    message,
    extra === undefined ? '' : formatArg(extra),
  ]
    .filter(Boolean)
    .join(' ')

  try {
    fs.appendFileSync(ensureLogFile(), `${line}\n`, 'utf8')
  } catch {
    /* logging never crashes the app */
  }

  if (level === 'ERROR' || level === 'WARN') {
    console.error(line)
  } else {
    console.log(line)
  }
}

export function installElectronCrashHooks() {
  process.on('uncaughtException', (err) => {
    logElectron('ERROR', 'uncaughtException', err)
  })

  process.on('unhandledRejection', (reason) => {
    logElectron('ERROR', 'unhandledRejection', reason)
  })

  process.on('exit', (code) => {
    logElectron('INFO', 'process.exit', { code })
  })

  process.on('SIGTERM', () => {
    logElectron('WARN', 'signal SIGTERM')
  })

  process.on('SIGINT', () => {
    logElectron('WARN', 'signal SIGINT')
  })

  app.on('child-process-gone', (_event, details) => {
    logElectron('ERROR', 'child-process-gone', details)
  })

  app.on('render-process-gone', (_event, _webContents, details) => {
    logElectron('ERROR', 'render-process-gone', details)
  })

  app.on('gpu-process-crashed', (_event, killed) => {
    logElectron('ERROR', 'gpu-process-crashed', { killed })
  })

  app.on('before-quit', (event) => {
    logElectron('INFO', 'before-quit', { defaultPrevented: event.defaultPrevented })
  })

  app.on('will-quit', () => {
    logElectron('INFO', 'will-quit')
  })

  app.on('quit', (_event, exitCode) => {
    logElectron('INFO', 'quit', { exitCode })
  })

  app.on('window-all-closed', () => {
    logElectron('INFO', 'window-all-closed')
  })
}

export function logElectronStartup() {
  logElectron('INFO', 'electron.startup', {
    pid: process.pid,
    version: typeof app.getVersion === 'function' ? app.getVersion() : null,
    packaged: app.isPackaged,
    execPath: process.execPath,
    resourcesPath: process.resourcesPath || null,
    cwd: process.cwd(),
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR || null,
    portableFile: process.env.PORTABLE_EXECUTABLE_FILE || null,
    platform: process.platform,
    arch: process.arch,
  })
}
