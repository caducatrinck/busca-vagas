import path from 'node:path'
import { fileURLToPath } from 'node:url'

function resolveModuleDir(): string {
  try {
    const meta = import.meta.url
    if (meta && String(meta).startsWith('file:')) {
      return path.dirname(fileURLToPath(meta))
    }
  } catch {

  }
  return path.dirname(path.resolve(process.argv[1] || process.cwd()))
}

const moduleDir = resolveModuleDir()

export function resolveDataDir(): string {
  const fromEnv = process.env.BUSCA_VAGAS_DATA_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  return path.resolve(moduleDir, '../data')
}

export function resolveLogsDir(): string {
  return path.join(resolveDataDir(), 'logs')
}
