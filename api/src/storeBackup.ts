import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

export const MAX_BACKUPS = 10

export function formatBackupStamp(date = new Date()): string {
  const dia = date.getDate()
  const mes = date.getMonth() + 1
  const hora = date.getHours()
  const min = String(date.getMinutes()).padStart(2, '0')
  return `DIA-${dia}-MES-${mes}-HORA${hora}-${min}`
}

async function uniqueBackupPath(backupDir: string, date = new Date()): Promise<string> {
  const stamp = formatBackupStamp(date)
  let candidate = path.join(backupDir, `${stamp}.json`)
  try {
    await readFile(candidate)
  } catch {
    return candidate
  }
  const sec = String(date.getSeconds()).padStart(2, '0')
  candidate = path.join(backupDir, `${stamp}-SEG${sec}.json`)
  try {
    await readFile(candidate)
  } catch {
    return candidate
  }
  for (let i = 2; i < 100; i++) {
    candidate = path.join(backupDir, `${stamp}-SEG${sec}-${i}.json`)
    try {
      await readFile(candidate)
    } catch {
      return candidate
    }
  }
  return path.join(backupDir, `${stamp}-${Date.now()}.json`)
}

export async function listBackupFiles(backupDir: string): Promise<string[]> {
  try {
    const names = await readdir(backupDir)
    return names
      .filter((n) => n.endsWith('.json'))
      .map((n) => path.join(backupDir, n))
  } catch {
    return []
  }
}

export async function pruneBackups(backupDir: string): Promise<void> {
  const files = await listBackupFiles(backupDir)
  if (files.length <= MAX_BACKUPS) return

  const withMtime = await Promise.all(
    files.map(async (file) => {
      try {
        const s = await stat(file)
        return { file, mtime: s.mtimeMs }
      } catch {
        return { file, mtime: 0 }
      }
    }),
  )
  withMtime.sort((a, b) => b.mtime - a.mtime)
  for (const item of withMtime.slice(MAX_BACKUPS)) {
    await unlink(item.file).catch(() => undefined)
  }
}

/** Remove todos os backups internos (não afeta exports em Downloads). */
export async function clearAllBackups(backupDir: string): Promise<void> {
  const files = await listBackupFiles(backupDir)
  await Promise.all(files.map((file) => unlink(file).catch(() => undefined)))
}

/**
 * Copia o store atual para backups/ antes de sobrescrever.
 * Não faz backup se o arquivo não existir ou estiver vazio.
 */
export async function backupStoreFile(
  storePath: string,
  backupDir: string,
): Promise<string | null> {
  let raw: string
  try {
    raw = await readFile(storePath, 'utf8')
  } catch {
    return null
  }
  if (!raw.trim()) return null

  try {
    const parsed = JSON.parse(raw) as {
      jobs?: Record<string, unknown>
      monitors?: unknown[]
    }
    const jobCount = Object.keys(parsed.jobs ?? {}).length
    const monitorCount = Array.isArray(parsed.monitors) ? parsed.monitors.length : 0
    if (jobCount === 0 && monitorCount === 0) return null
  } catch {
    // arquivo corrompido: ainda assim guarda como backup
  }

  await mkdir(backupDir, { recursive: true })
  const dest = await uniqueBackupPath(backupDir)
  await copyFile(storePath, dest)
  await pruneBackups(backupDir)
  return dest
}

/** Tenta carregar o backup mais recente (por mtime). */
export async function readLatestBackup(
  backupDir: string,
): Promise<{ path: string; raw: string } | null> {
  const files = await listBackupFiles(backupDir)
  if (files.length === 0) return null

  const withMtime = await Promise.all(
    files.map(async (file) => {
      try {
        const s = await stat(file)
        return { file, mtime: s.mtimeMs }
      } catch {
        return { file, mtime: 0 }
      }
    }),
  )
  withMtime.sort((a, b) => b.mtime - a.mtime)

  for (const item of withMtime) {
    try {
      const raw = await readFile(item.file, 'utf8')
      JSON.parse(raw)
      return { path: item.file, raw }
    } catch {
      continue
    }
  }
  return null
}

/** Escrita atômica: .tmp → rename. */
export async function writeStoreAtomic(
  storePath: string,
  contents: string,
): Promise<void> {
  const dir = path.dirname(storePath)
  await mkdir(dir, { recursive: true })
  const tmp = `${storePath}.tmp`
  await writeFile(tmp, contents, 'utf8')
  await rename(tmp, storePath)
}
