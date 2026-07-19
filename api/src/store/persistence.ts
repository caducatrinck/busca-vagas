import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { log } from '../logger.js'
import { resolveDataDir } from '../paths.js'
import type { SearchParams } from '../types.js'
import {
  backupStoreFile,
  clearAllBackups,
  readLatestBackup,
  writeStoreAtomic,
} from '../storeBackup.js'
import {
  RATE_LIMIT_DEFAULTS_REV,
  type DescriptionFilters,
  type Monitor,
  type StoreData,
  type StoredJob,
} from './types.js'
import {
  DEFAULT_RATE_LIMIT,
  createMonitor,
  defaultAppSettings,
  defaultJobFilters,
  migrateCookiesFromLegacyEnv,
  normalizeJob,
  normalizeJobFilters,
  normalizeRateLimit,
  normalizeSettings,
  normalizeTheme,
  normalizeLocale,
} from './defaults.js'

function dataPaths() {
  const DATA_DIR = resolveDataDir()
  return {
    DATA_DIR,
    STORE_PATH: path.join(DATA_DIR, 'store.json'),
    BACKUP_DIR: path.join(DATA_DIR, 'backups'),
  }
}

const DEFAULT_STORE: StoreData = {
  jobs: {},
  monitors: [],
  rateLimit: { ...DEFAULT_RATE_LIMIT },
  settings: {
    linkedinLiAt: '',
    linkedinJsessionId: '',
    linkedinMaxPages: 1000,
    searchCooldownMs: 30_000,
    maxSearchesPerHour: 30,
    maxSearchesPerDay: 500,
    jobDetailConcurrency: 5,
    rateLimitDefaultsRev: RATE_LIMIT_DEFAULTS_REV,
  },
  filters: defaultJobFilters(),
  theme: 'light',
  locale: 'pt',
}
void DEFAULT_STORE

let cache: StoreData | null = null
let writeQueue: Promise<void> = Promise.resolve()

function parseStoreRaw(raw: string): StoreData {
  const parsed = JSON.parse(raw) as Partial<StoreData> & {
    poller?: {
      enabled?: boolean
      intervalMinutes?: number
      search?: SearchParams | null
      lastRunAt?: string | null
      lastError?: string | null
      newCountLastRun?: number
      knownIdsAtStart?: string[]
    }
  }

  const jobs: Record<string, StoredJob> = {}
  for (const [id, job] of Object.entries(parsed.jobs ?? {})) {
    jobs[id] = normalizeJob(job as StoredJob)
  }

  let monitors: Monitor[] = Array.isArray(parsed.monitors)
    ? parsed.monitors.map((m) => {
        const rawMon = m as Partial<Monitor> & {
          descriptionFilters?: DescriptionFilters | null
        }
        const monitor = createMonitor(rawMon)
        if (rawMon.descriptionFilters == null) {
          const global = normalizeJobFilters(
            (parsed as Partial<StoreData>).filters,
          )
          monitor.descriptionFilters = {
            excludeDescription: global.excludeDescription,
            includeDescription: global.includeDescription,
            language: global.language,
          }
        }
        return monitor
      })
    : []

  if (monitors.length === 0 && parsed.poller?.search?.query) {
    monitors = [
      createMonitor({
        name: parsed.poller.search.query.slice(0, 28) || 'Monitor',
        search: parsed.poller.search,
        pollingEnabled: Boolean(parsed.poller.enabled),
        intervalMinutes: parsed.poller.intervalMinutes ?? 20,
        lastRunAt: parsed.poller.lastRunAt ?? null,
        lastError: parsed.poller.lastError ?? null,
        newCountLastRun: parsed.poller.newCountLastRun ?? 0,
        knownIdsAtStart: parsed.poller.knownIdsAtStart ?? [],
      }),
    ]
  }

  return {
    jobs,
    monitors,
    rateLimit: normalizeRateLimit(parsed.rateLimit),
    settings: migrateCookiesFromLegacyEnv(
      normalizeSettings((parsed as Partial<StoreData>).settings),
    ),
    filters: normalizeJobFilters((parsed as Partial<StoreData>).filters),
    theme: normalizeTheme((parsed as Partial<StoreData>).theme),
    locale: normalizeLocale((parsed as Partial<StoreData>).locale),
  }
}

function emptyStore(): StoreData {
  return {
    jobs: {},
    monitors: [],
    rateLimit: { ...DEFAULT_RATE_LIMIT },
    settings: migrateCookiesFromLegacyEnv(defaultAppSettings()),
    filters: defaultJobFilters(),
    theme: 'light',
    locale: 'pt',
  }
}

function jobCount(data: StoreData): number {
  return Object.keys(data.jobs).length
}

export async function ensureStore(): Promise<StoreData> {
  if (cache) return cache

  const { DATA_DIR, STORE_PATH, BACKUP_DIR } = dataPaths()
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(BACKUP_DIR, { recursive: true })

  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    cache = parseStoreRaw(raw)
    let fileRev: number | null = null
    try {
      const parsed = JSON.parse(raw) as {
        settings?: { rateLimitDefaultsRev?: number }
      }
      fileRev = Number(parsed.settings?.rateLimitDefaultsRev)
      if (!Number.isFinite(fileRev)) fileRev = null
    } catch {
      fileRev = null
    }
    if (fileRev == null || fileRev < RATE_LIMIT_DEFAULTS_REV) {
      await writeStoreAtomic(STORE_PATH, JSON.stringify(cache, null, 2))
      log.info('store.rate_limit_defaults_updated', {
        cooldownMs: 30_000,
        maxPerHour: 30,
        maxPerDay: 500,
      })
    }
    return cache
  } catch (err) {
    const isMissing =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'

    if (!isMissing) {
      log.error('store.read_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const backup = await readLatestBackup(BACKUP_DIR)
    if (backup) {
      try {
        cache = parseStoreRaw(backup.raw)
        log.warn('store.recovered_from_backup', {
          backup: path.basename(backup.path),
          jobs: jobCount(cache),
        })
        // Restaura o arquivo principal a partir do backup (sem criar novo backup vazio)
        await writeStoreAtomic(STORE_PATH, JSON.stringify(cache, null, 2))
        return cache
      } catch (backupErr) {
        log.error('store.backup_invalid', {
          error:
            backupErr instanceof Error ? backupErr.message : String(backupErr),
        })
      }
    }

    if (isMissing) {
      cache = emptyStore()
      await writeStoreAtomic(STORE_PATH, JSON.stringify(cache, null, 2))
      return cache
    }

    // Arquivo existe mas está corrompido e não há backup: NÃO sobrescreve.
    // Mantém cache vazio em memória só para a API não cair; o disco fica intacto.
    log.error('store.corrupt_no_backup', {
      path: STORE_PATH,
    })
    cache = emptyStore()
    return cache
  }
}

export async function persist(
  data: StoreData,
  options?: { allowEmptyOverwrite?: boolean; skipBackup?: boolean },
): Promise<void> {
  cache = data
  writeQueue = writeQueue.then(async () => {
    const { DATA_DIR, STORE_PATH, BACKUP_DIR } = dataPaths()
    await mkdir(DATA_DIR, { recursive: true })
    await mkdir(BACKUP_DIR, { recursive: true })

    const nextJobs = jobCount(data)
    if (!options?.allowEmptyOverwrite && nextJobs === 0) {
      try {
        const existingRaw = await readFile(STORE_PATH, 'utf8')
        const existing = parseStoreRaw(existingRaw)
        if (jobCount(existing) > 0) {
          log.error('store.refused_empty_overwrite', {
            existingJobs: jobCount(existing),
          })
          return
        }
      } catch {
        // sem arquivo anterior — ok gravar vazio
      }
    }

    if (!options?.skipBackup) {
      await backupStoreFile(STORE_PATH, BACKUP_DIR)
    }
    await writeStoreAtomic(STORE_PATH, JSON.stringify(data, null, 2))
  })
  await writeQueue
}

/** Apaga backups internos em data/backups (exports em Downloads ficam intactos). */
export async function clearInternalStoreBackups(): Promise<void> {
  const { BACKUP_DIR } = dataPaths()
  await clearAllBackups(BACKUP_DIR)
}

export async function getStore(): Promise<StoreData> {
  return ensureStore()
}
