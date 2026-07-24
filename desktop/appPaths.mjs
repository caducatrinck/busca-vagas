import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Layout estável sob o userData do Electron:
 *
 *   {home}/
 *     data/   store.json e demais dados
 *     logs/   app.log + electron.log
 *
 * Portable: o runtime ainda extrai em %TEMP% (limitação do electron-builder).
 * Dados/logs ficam sempre em userData — nunca no TEMP.
 */

export function resolveAppHome() {
  return app.getPath('userData')
}

export function resolveDataDir() {
  return path.join(resolveAppHome(), 'data')
}

export function resolveLogsDir() {
  return path.join(resolveAppHome(), 'logs')
}

/** Move logs antigos de data/logs → logs (irmão de data). */
export function migrateLegacyLogsLayout() {
  const home = resolveAppHome()
  const legacy = path.join(home, 'data', 'logs')
  const target = path.join(home, 'logs')

  if (!fs.existsSync(legacy)) return { migrated: false }

  fs.mkdirSync(target, { recursive: true })

  let moved = 0
  for (const name of fs.readdirSync(legacy)) {
    const from = path.join(legacy, name)
    const to = path.join(target, name)
    try {
      if (fs.existsSync(to)) continue
      fs.renameSync(from, to)
      moved += 1
    } catch {
      try {
        fs.copyFileSync(from, to)
        fs.unlinkSync(from)
        moved += 1
      } catch {
        /* best-effort */
      }
    }
  }

  try {
    if (fs.readdirSync(legacy).length === 0) fs.rmdirSync(legacy)
  } catch {
    /* ignore */
  }

  return { migrated: moved > 0, moved, from: legacy, to: target }
}

export function ensureAppDirs() {
  const dataDir = resolveDataDir()
  const logsDir = resolveLogsDir()
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })
  return { home: resolveAppHome(), dataDir, logsDir }
}
