import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import path from 'node:path'
import { resolveLogsDir } from './paths.js'

const MAX_TOTAL_BYTES = 300 * 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024
const ACTIVE_NAME = 'app.log'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMeta = Record<string, unknown>

let writeQueue: Promise<void> = Promise.resolve()
let lastPruneAt = 0

function logsDir(): string {
  const dir = resolveLogsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function activePath(): string {
  return path.join(logsDir(), ACTIVE_NAME)
}

function listLogFiles(): { name: string; path: string; size: number; mtimeMs: number }[] {
  const dir = logsDir()
  return readdirSync(dir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => {
      const full = path.join(dir, name)
      try {
        const st = statSync(full)
        return {
          name,
          path: full,
          size: st.size,
          mtimeMs: st.mtimeMs,
        }
      } catch {
        return null
      }
    })
    .filter((f): f is NonNullable<typeof f> => f != null)
}

export function pruneLogFiles(maxTotalBytes = MAX_TOTAL_BYTES): void {
  const files = listLogFiles().sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = files.reduce((sum, f) => sum + f.size, 0)
  for (const file of files) {
    if (total <= maxTotalBytes) break
    if (file.name === ACTIVE_NAME) continue
    try {
      unlinkSync(file.path)
      total -= file.size
    } catch {

    }
  }


  if (total > maxTotalBytes) {
    const active = files.find((f) => f.name === ACTIVE_NAME)
    if (active && active.size > 0) {
      try {
        rotateActiveFile()
        pruneLogFiles(maxTotalBytes)
      } catch {

      }
    }
  }
}

function rotateActiveFile(): void {
  const active = activePath()
  if (!existsSync(active)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(logsDir(), `app-${stamp}.log`)
  renameSync(active, dest)
}

function maybeRotateAndPrune(): void {
  try {
    const active = activePath()
    if (existsSync(active)) {
      const size = statSync(active).size
      if (size >= MAX_FILE_BYTES) rotateActiveFile()
    }
    const now = Date.now()
    if (now - lastPruneAt > 30_000) {
      lastPruneAt = now
      pruneLogFiles()
    }
  } catch {

  }
}

function formatLine(
  level: LogLevel,
  message: string,
  meta?: LogMeta,
): string {
  const ts = new Date().toISOString()
  const base = `${ts} [${level.toUpperCase()}] ${message}`
  if (!meta || Object.keys(meta).length === 0) return `${base}\n`
  try {
    return `${base} ${JSON.stringify(meta)}\n`
  } catch {
    return `${base}\n`
  }
}

function writeLine(level: LogLevel, message: string, meta?: LogMeta): void {
  const line = formatLine(level, message, meta)
  const consoleFn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log
  consoleFn(line.trimEnd())

  writeQueue = writeQueue
    .then(() => {
      maybeRotateAndPrune()
      appendFileSync(activePath(), line, 'utf8')
    })
    .catch(() => {

    })
}

export const log = {
  debug(message: string, meta?: LogMeta) {
    writeLine('debug', message, meta)
  },
  info(message: string, meta?: LogMeta) {
    writeLine('info', message, meta)
  },
  warn(message: string, meta?: LogMeta) {
    writeLine('warn', message, meta)
  },
  error(message: string, meta?: LogMeta) {
    writeLine('error', message, meta)
  },

  async flush() {
    await writeQueue
  },
}
