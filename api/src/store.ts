import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { Job, SearchParams, SearchRunStats } from './types.js'
import { parseContractTags, resolveWorkplaceType } from './types.js'
import {
  backupStoreFile,
  readLatestBackup,
  writeStoreAtomic,
} from './storeBackup.js'

function resolveModuleDir(): string {
  try {
    const meta = import.meta.url
    if (meta && String(meta).startsWith('file:')) {
      return path.dirname(fileURLToPath(meta))
    }
  } catch {
    /* esbuild CJS: import.meta.url vazio */
  }
  return path.dirname(path.resolve(process.argv[1] || process.cwd()))
}

const moduleDir = resolveModuleDir()

function resolveDataDir(): string {
  const fromEnv = process.env.BUSCA_VAGAS_DATA_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.resolve(moduleDir, '../data')
}

function dataPaths() {
  const DATA_DIR = resolveDataDir()
  return {
    DATA_DIR,
    STORE_PATH: path.join(DATA_DIR, 'store.json'),
    BACKUP_DIR: path.join(DATA_DIR, 'backups'),
  }
}

export type JobStatus = 'viewed' | 'applied' | 'discarded'

export type StoredJob = Job & {
  status: JobStatus

  applied: boolean
  firstSeenAt: string
  lastSeenAt: string
  monitorIds: string[]
}

export type Monitor = {
  id: string
  name: string
  search: SearchParams
  pollingEnabled: boolean
  intervalMinutes: number
  lastRunAt: string | null

  nextRunAt: string | null
  lastError: string | null
  newCountLastRun: number
  /** Origem da última rodada — só pooling dispara notificação no cliente. */
  lastRunMode: 'manual' | 'pooling' | null
  knownIdsAtStart: string[]
  lastRunStats: SearchRunStats | null
  /** Filtros de descrição/idioma desta aba (não globais). */
  descriptionFilters: DescriptionFilters
}

export type StoredRateLimit = {
  events: number[]
  lastSearchAt: number | null
  /** Bloqueio até este timestamp (ms), definido por erros reais do LinkedIn. */
  blockedUntil: number | null
  blockReason: string | null
  lastLinkedInStatus: number | null
}

export type AppSettings = {
  linkedinLiAt: string
  linkedinJsessionId: string
  linkedinMaxPages: number
  searchCooldownMs: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
  /** bump pra atualizar defaults velhos de rate limit */
  rateLimitDefaultsRev: number
}

/** rev 2 → 30s, 30/hora, 500/dia */
export const RATE_LIMIT_DEFAULTS_REV = 2

export type JobFilters = {
  excludeTitle: string[]
  includeTitle: string[]
  excludeDescription: string[]
  includeDescription: string[]
  language: '' | 'pt' | 'en'
}

export type DescriptionFilters = {
  excludeDescription: string[]
  includeDescription: string[]
  language: '' | 'pt' | 'en'
}

export type ThemeMode = 'light' | 'dark'

export type UiPrefs = {
  filters: JobFilters
  theme: ThemeMode
}

export type StoreData = {
  jobs: Record<string, StoredJob>
  monitors: Monitor[]
  rateLimit: StoredRateLimit
  settings: AppSettings
  filters: JobFilters
  theme: ThemeMode
}

const DEFAULT_RATE_LIMIT: StoredRateLimit = {
  events: [],
  lastSearchAt: null,
  blockedUntil: null,
  blockReason: null,
  lastLinkedInStatus: null,
}

export function defaultJobFilters(): JobFilters {
  return {
    excludeTitle: [],
    includeTitle: [],
    excludeDescription: [],
    includeDescription: [],
    language: '',
  }
}

export function defaultDescriptionFilters(): DescriptionFilters {
  return {
    excludeDescription: [],
    includeDescription: [],
    language: '',
  }
}

export function normalizeDescriptionFilters(
  raw?: Partial<DescriptionFilters> | null,
): DescriptionFilters {
  const base = defaultDescriptionFilters()
  if (!raw || typeof raw !== 'object') return base
  const language =
    raw.language === 'pt' || raw.language === 'en' ? raw.language : ''
  return {
    excludeDescription: Array.isArray(raw.excludeDescription)
      ? raw.excludeDescription.filter((w) => typeof w === 'string')
      : base.excludeDescription,
    includeDescription: Array.isArray(raw.includeDescription)
      ? raw.includeDescription.filter((w) => typeof w === 'string')
      : base.includeDescription,
    language,
  }
}

export function normalizeJobFilters(raw?: Partial<JobFilters> | null): JobFilters {
  const base = defaultJobFilters()
  if (!raw || typeof raw !== 'object') return base
  const language =
    raw.language === 'pt' || raw.language === 'en' ? raw.language : ''
  return {
    excludeTitle: Array.isArray(raw.excludeTitle)
      ? raw.excludeTitle.filter((w) => typeof w === 'string')
      : base.excludeTitle,
    includeTitle: Array.isArray(raw.includeTitle)
      ? raw.includeTitle.filter((w) => typeof w === 'string')
      : base.includeTitle,
    excludeDescription: Array.isArray(raw.excludeDescription)
      ? raw.excludeDescription.filter((w) => typeof w === 'string')
      : base.excludeDescription,
    includeDescription: Array.isArray(raw.includeDescription)
      ? raw.includeDescription.filter((w) => typeof w === 'string')
      : base.includeDescription,
    language,
  }
}

export function normalizeTheme(raw?: unknown): ThemeMode {
  return raw === 'dark' ? 'dark' : 'light'
}

export function defaultAppSettings(): AppSettings {
  return {
    linkedinLiAt: '',
    linkedinJsessionId: '',
    linkedinMaxPages: 1000,
    searchCooldownMs: 30_000,
    maxSearchesPerHour: 30,
    maxSearchesPerDay: 500,
    jobDetailConcurrency: 5,
    rateLimitDefaultsRev: RATE_LIMIT_DEFAULTS_REV,
  }
}

function migrateCookiesFromLegacyEnv(settings: AppSettings): AppSettings {
  const liAt =
    settings.linkedinLiAt.trim() || process.env.LINKEDIN_LI_AT?.trim() || ''
  const jsession =
    settings.linkedinJsessionId.trim() ||
    process.env.LINKEDIN_JSESSIONID?.trim().replace(/^"|"$/g, '') ||
    ''
  if (liAt === settings.linkedinLiAt && jsession === settings.linkedinJsessionId) {
    return settings
  }
  return { ...settings, linkedinLiAt: liAt, linkedinJsessionId: jsession }
}

function normalizeSettings(
  raw?: (Partial<AppSettings> & { rateLimitDefaultsRev?: number }) | null,
): AppSettings {
  const base = defaultAppSettings()
  if (!raw || typeof raw !== 'object') return base

  const prevRev = Number(
    (raw as { rateLimitDefaultsRev?: number }).rateLimitDefaultsRev,
  )
  const needsRateLimitDefaults =
    !Number.isFinite(prevRev) || prevRev < RATE_LIMIT_DEFAULTS_REV

  return {
    linkedinLiAt:
      typeof raw.linkedinLiAt === 'string' ? raw.linkedinLiAt.trim() : base.linkedinLiAt,
    linkedinJsessionId:
      typeof raw.linkedinJsessionId === 'string'
        ? raw.linkedinJsessionId.trim()
        : base.linkedinJsessionId,
    linkedinMaxPages: Math.min(
      Math.max(Number(raw.linkedinMaxPages) || base.linkedinMaxPages, 1),
      5000,
    ),
    searchCooldownMs: needsRateLimitDefaults
      ? base.searchCooldownMs
      : (() => {
          if (raw.searchCooldownMs === undefined || raw.searchCooldownMs === null) {
            return base.searchCooldownMs
          }
          const n = Number(raw.searchCooldownMs)
          if (!Number.isFinite(n)) return base.searchCooldownMs
          return Math.min(Math.max(n, 0), 600_000)
        })(),
    maxSearchesPerHour: needsRateLimitDefaults
      ? base.maxSearchesPerHour
      : (() => {
          if (
            raw.maxSearchesPerHour === undefined ||
            raw.maxSearchesPerHour === null
          ) {
            return base.maxSearchesPerHour
          }
          const n = Number(raw.maxSearchesPerHour)
          if (!Number.isFinite(n)) return base.maxSearchesPerHour
          return Math.min(Math.max(n, 0), 500)
        })(),
    maxSearchesPerDay: needsRateLimitDefaults
      ? base.maxSearchesPerDay
      : (() => {
          if (
            raw.maxSearchesPerDay === undefined ||
            raw.maxSearchesPerDay === null
          ) {
            return base.maxSearchesPerDay
          }
          const n = Number(raw.maxSearchesPerDay)
          if (!Number.isFinite(n)) return base.maxSearchesPerDay
          return Math.min(Math.max(n, 0), 2000)
        })(),
    jobDetailConcurrency: Math.min(
      Math.max(Number(raw.jobDetailConcurrency) || base.jobDetailConcurrency, 1),
      20,
    ),
    rateLimitDefaultsRev: RATE_LIMIT_DEFAULTS_REV,
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
}

let cache: StoreData | null = null
let writeQueue: Promise<void> = Promise.resolve()

function resolveStatus(
  job: Partial<StoredJob> & { applied?: boolean; status?: JobStatus },
): JobStatus {
  if (job.status === 'viewed' || job.status === 'applied' || job.status === 'discarded') {
    return job.status
  }
  return job.applied ? 'applied' : 'viewed'
}

function normalizeJob(job: Partial<StoredJob> & Job): StoredJob {
  const status = resolveStatus(job)
  const description = job.description ?? ''
  const contractTags = description.trim()
    ? parseContractTags(description)
    : Array.isArray(job.contractTags)
      ? job.contractTags
      : []
  const workplaceType =
    resolveWorkplaceType(job.workplaceType, description) ?? job.workplaceType
  const workplaceResolved =
    Boolean(job.workplaceResolved) ||
    Boolean(workplaceType && job.workplaceType === workplaceType)
  return {
    ...job,
    description,
    contractTags,
    workplaceType,
    workplaceResolved: workplaceResolved || undefined,
    status,
    applied: status === 'applied',
    firstSeenAt: job.firstSeenAt || new Date().toISOString(),
    lastSeenAt: job.lastSeenAt || new Date().toISOString(),
    monitorIds: Array.isArray(job.monitorIds) ? job.monitorIds : [],
  }
}

function createMonitor(partial?: Partial<Monitor>): Monitor {
  const id = partial?.id || randomUUID()
  return {
    id,
    name: partial?.name?.trim() || 'Monitor',
    search: {
      query: partial?.search?.query ?? '',
      location: partial?.search?.location?.trim() || 'Brasil',
      postedWithin: partial?.search?.postedWithin ?? 'week',
      fetchDescriptions: Boolean(partial?.search?.fetchDescriptions),
    },
    pollingEnabled: Boolean(partial?.pollingEnabled),
    intervalMinutes: Math.min(Math.max(partial?.intervalMinutes ?? 20, 1), 120),
    lastRunAt: partial?.lastRunAt ?? null,
    nextRunAt: partial?.nextRunAt ?? null,
    lastError: partial?.lastError ?? null,
    newCountLastRun: partial?.newCountLastRun ?? 0,
    lastRunMode:
      partial?.lastRunMode === 'manual' || partial?.lastRunMode === 'pooling'
        ? partial.lastRunMode
        : null,
    knownIdsAtStart: partial?.knownIdsAtStart ?? [],
    lastRunStats: partial?.lastRunStats ?? null,
    descriptionFilters: normalizeDescriptionFilters(partial?.descriptionFilters),
  }
}

function normalizeRateLimit(raw?: Partial<StoredRateLimit> | null): StoredRateLimit {
  const events = Array.isArray(raw?.events)
    ? raw.events
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []
  const last = raw?.lastSearchAt
  const blockedUntil = raw?.blockedUntil
  const lastLinkedInStatus = raw?.lastLinkedInStatus
  return {
    events,
    lastSearchAt:
      typeof last === 'number' && Number.isFinite(last) && last > 0 ? last : null,
    blockedUntil:
      typeof blockedUntil === 'number' &&
      Number.isFinite(blockedUntil) &&
      blockedUntil > 0
        ? blockedUntil
        : null,
    blockReason:
      typeof raw?.blockReason === 'string' && raw.blockReason.trim()
        ? raw.blockReason.trim()
        : null,
    lastLinkedInStatus:
      typeof lastLinkedInStatus === 'number' && Number.isFinite(lastLinkedInStatus)
        ? lastLinkedInStatus
        : null,
  }
}

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

  let monitors = Array.isArray(parsed.monitors)
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
  }
}

function jobCount(data: StoreData): number {
  return Object.keys(data.jobs).length
}

async function ensureStore(): Promise<StoreData> {
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
      console.log(
        '[store] rate limit atualizado: 30s / 30 por hora / 500 por dia',
      )
    }
    return cache
  } catch (err) {
    const isMissing =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT'

    if (!isMissing) {
      console.error(
        '[store] falha ao ler store.json — tentando backup automático',
        err instanceof Error ? err.message : err,
      )
    }

    const backup = await readLatestBackup(BACKUP_DIR)
    if (backup) {
      try {
        cache = parseStoreRaw(backup.raw)
        console.warn(
          `[store] recuperado do backup ${path.basename(backup.path)} (${jobCount(cache)} vagas)`,
        )
        // Restaura o arquivo principal a partir do backup (sem criar novo backup vazio)
        await writeStoreAtomic(STORE_PATH, JSON.stringify(cache, null, 2))
        return cache
      } catch (backupErr) {
        console.error(
          '[store] backup inválido',
          backupErr instanceof Error ? backupErr.message : backupErr,
        )
      }
    }

    if (isMissing) {
      cache = emptyStore()
      await writeStoreAtomic(STORE_PATH, JSON.stringify(cache, null, 2))
      return cache
    }

    // Arquivo existe mas está corrompido e não há backup: NÃO sobrescreve.
    // Mantém cache vazio em memória só para a API não cair; o disco fica intacto.
    console.error(
      '[store] store.json corrompido e sem backup válido — NÃO apaguei o arquivo. Corrija manualmente ou restaure de api/data/backups/',
    )
    cache = emptyStore()
    return cache
  }
}

async function persist(
  data: StoreData,
  options?: { allowEmptyOverwrite?: boolean },
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
          console.error(
            `[store] recusou gravar store vazio sobre arquivo com ${jobCount(existing)} vaga(s)`,
          )
          return
        }
      } catch {
        // sem arquivo anterior — ok gravar vazio
      }
    }

    await backupStoreFile(STORE_PATH, BACKUP_DIR)
    await writeStoreAtomic(STORE_PATH, JSON.stringify(data, null, 2))
  })
  await writeQueue
}

export async function getStore(): Promise<StoreData> {
  return ensureStore()
}

export async function getJobSearchHints(): Promise<{
  discardedIds: Set<string>
  knownDescriptions: Map<string, string>
  knownWorkplaceTypes: Map<string, Job['workplaceType']>
}> {
  const store = await ensureStore()
  const discardedIds = new Set<string>()
  const knownDescriptions = new Map<string, string>()
  const knownWorkplaceTypes = new Map<string, Job['workplaceType']>()

  for (const job of Object.values(store.jobs)) {
    const normalized = normalizeJob(job)
    if (normalized.status === 'discarded') {
      discardedIds.add(normalized.id)
    }

    const description = normalized.description?.trim()
    if (description) {
      knownDescriptions.set(normalized.id, description)
    }
    if (normalized.workplaceType) {
      knownWorkplaceTypes.set(normalized.id, normalized.workplaceType)
    }
  }

  return { discardedIds, knownDescriptions, knownWorkplaceTypes }
}

export async function listJobs(options?: {
  status?: JobStatus
  appliedOnly?: boolean
  monitorId?: string
  excludeDiscarded?: boolean
}): Promise<StoredJob[]> {
  const store = await ensureStore()
  let jobs = Object.values(store.jobs).map(normalizeJob)

  if (options?.status) {
    jobs = jobs.filter((j) => j.status === options.status)
  } else if (options?.appliedOnly) {
    jobs = jobs.filter((j) => j.status === 'applied')
  }
  if (options?.excludeDiscarded) {
    jobs = jobs.filter((j) => j.status !== 'discarded')
  }
  if (options?.monitorId) {
    jobs = jobs.filter((j) => j.monitorIds.includes(options.monitorId!))
  }

  jobs.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  return jobs
}

export async function upsertSearchResults(
  jobs: Job[],
  monitorId?: string,
): Promise<{
  jobs: StoredJob[]
  newJobs: StoredJob[]
}> {
  const store = await ensureStore()
  const now = new Date().toISOString()
  const newJobs: StoredJob[] = []
  const result: StoredJob[] = []

  for (const job of jobs) {
    const existing = store.jobs[job.id]
    if (existing) {
      const monitorIds = new Set(existing.monitorIds)
      if (monitorId) monitorIds.add(monitorId)
      const status = resolveStatus(existing)
      const merged: StoredJob = {
        ...existing,
        ...job,
        description: job.description || existing.description,
        workplaceType:
          job.workplaceType !== undefined
            ? job.workplaceType
            : existing.workplaceType,
        workplaceResolved:
          job.workplaceResolved || existing.workplaceResolved,
        postedAt: preferPostedAt(job.postedAt, existing.postedAt),
        postedLabel: job.postedLabel?.trim() || existing.postedLabel,
        status,
        applied: status === 'applied',
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: now,
        monitorIds: [...monitorIds],
      }
      store.jobs[job.id] = normalizeJob(merged)
      result.push(store.jobs[job.id])
    } else {
      const created = normalizeJob({
        ...job,
        status: 'viewed',
        applied: false,
        firstSeenAt: now,
        lastSeenAt: now,
        monitorIds: monitorId ? [monitorId] : [],
      })
      store.jobs[job.id] = created
      newJobs.push(created)
      result.push(created)
    }
  }

  await persist(store)
  return { jobs: result, newJobs }
}

/** Prefere ISO com horário a data só-dia; atualiza quando a nova coleta traz mais precisão. */
function preferPostedAt(
  incoming?: string,
  existing?: string,
): string | undefined {
  const next = incoming?.trim()
  const prev = existing?.trim()
  if (!next) return prev
  if (!prev) return next
  const nextPrecise = next.includes('T')
  const prevPrecise = prev.includes('T')
  if (nextPrecise) return next
  if (prevPrecise && !nextPrecise) return prev
  return next
}

export async function setJobStatus(
  id: string,
  status: JobStatus,
): Promise<StoredJob | null> {
  const store = await ensureStore()
  const job = store.jobs[id]
  if (!job) return null
  job.status = status
  job.applied = status === 'applied'
  job.lastSeenAt = new Date().toISOString()
  store.jobs[id] = normalizeJob(job)
  await persist(store)
  return store.jobs[id]
}

export async function setJobApplied(
  id: string,
  applied: boolean,
): Promise<StoredJob | null> {
  return setJobStatus(id, applied ? 'applied' : 'viewed')
}

export async function deleteJobsByStatus(
  status: Extract<JobStatus, 'applied' | 'discarded'>,
): Promise<number> {
  const store = await ensureStore()
  let removed = 0
  for (const [id, job] of Object.entries(store.jobs)) {
    if (resolveStatus(job) === status) {
      delete store.jobs[id]
      removed += 1
    }
  }
  if (removed > 0) await persist(store)
  return removed
}

export async function listMonitors(): Promise<Monitor[]> {
  const store = await ensureStore()
  return store.monitors
}

export async function getMonitor(id: string): Promise<Monitor | null> {
  const store = await ensureStore()
  return store.monitors.find((m) => m.id === id) ?? null
}

export async function createMonitorRecord(
  input?: Partial<Monitor>,
): Promise<Monitor> {
  const store = await ensureStore()
  const monitor = createMonitor({
    ...input,
    name:
      input?.name ||
      input?.search?.query?.trim()?.slice(0, 28) ||
      `Monitor ${store.monitors.length + 1}`,
  })
  store.monitors.push(monitor)
  await persist(store)
  return monitor
}

export async function updateMonitor(
  id: string,
  patch: Partial<Monitor>,
): Promise<Monitor | null> {
  const store = await ensureStore()
  const index = store.monitors.findIndex((m) => m.id === id)
  if (index < 0) return null

  const current = store.monitors[index]
  const next = createMonitor({
    ...current,
    ...patch,
    id: current.id,
    search: {
      ...current.search,
      ...patch.search,
    },
    descriptionFilters: normalizeDescriptionFilters(
      patch.descriptionFilters ?? current.descriptionFilters,
    ),
  })
  store.monitors[index] = next
  await persist(store)
  return next
}

export async function deleteMonitor(id: string): Promise<boolean> {
  const store = await ensureStore()
  const before = store.monitors.length
  store.monitors = store.monitors.filter((m) => m.id !== id)
  if (store.monitors.length === before) return false
  await persist(store)
  return true
}

export function withNewFlag(
  jobs: StoredJob[],
  newIds: Iterable<string>,
): Array<StoredJob & { isNew: boolean }> {
  const set = new Set(newIds)
  return jobs.map((job) => ({
    ...job,
    isNew: set.has(job.id),
  }))
}

export async function getAppSettings(): Promise<AppSettings> {
  const store = await ensureStore()
  return { ...store.settings }
}

export type PublicAppSettings = {
  ready: boolean
  linkedinLiAtSet: boolean
  linkedinLiAtHint: string
  linkedinJsessionIdSet: boolean
  linkedinMaxPages: number
  searchCooldownMs: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
}

export function isAppConfigured(settings: AppSettings): boolean {
  return Boolean(settings.linkedinLiAt.trim())
}

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  const li = settings.linkedinLiAt
  const ready = isAppConfigured(settings)
  return {
    ready,
    linkedinLiAtSet: ready,
    linkedinLiAtHint: li
      ? li.length <= 4
        ? '••••'
        : `••••${li.slice(-4)}`
      : '',
    linkedinJsessionIdSet: Boolean(settings.linkedinJsessionId),
    linkedinMaxPages: settings.linkedinMaxPages,
    searchCooldownMs: settings.searchCooldownMs,
    maxSearchesPerHour: settings.maxSearchesPerHour,
    maxSearchesPerDay: settings.maxSearchesPerDay,
    jobDetailConcurrency: settings.jobDetailConcurrency,
  }
}

export async function updateAppSettings(
  patch: Partial<AppSettings> & {

    clearLinkedinLiAt?: boolean
    clearLinkedinJsessionId?: boolean
  },
): Promise<AppSettings> {
  const store = await ensureStore()
  const current = store.settings

  let linkedinLiAt = current.linkedinLiAt
  if (patch.clearLinkedinLiAt) linkedinLiAt = ''
  else if (typeof patch.linkedinLiAt === 'string') {
    linkedinLiAt = patch.linkedinLiAt.trim()
  }

  let linkedinJsessionId = current.linkedinJsessionId
  if (patch.clearLinkedinJsessionId) linkedinJsessionId = ''
  else if (typeof patch.linkedinJsessionId === 'string') {
    linkedinJsessionId = patch.linkedinJsessionId.trim()
  }

  store.settings = normalizeSettings({
    ...current,
    ...patch,
    linkedinLiAt,
    linkedinJsessionId,
  })
  await persist(store)
  return { ...store.settings }
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const store = await ensureStore()
  return {
    filters: normalizeJobFilters(store.filters),
    theme: normalizeTheme(store.theme),
  }
}

export async function updateUiPrefs(
  patch: Partial<UiPrefs>,
): Promise<UiPrefs> {
  const store = await ensureStore()
  if (patch.filters) {
    store.filters = normalizeJobFilters(patch.filters)
  }
  if (patch.theme !== undefined) {
    store.theme = normalizeTheme(patch.theme)
  }
  await persist(store)
  return getUiPrefs()
}

export async function exportStoreData(): Promise<StoreData> {
  const store = await ensureStore()
  return structuredClone(store)
}

export async function getRateLimitState(): Promise<StoredRateLimit> {
  const store = await ensureStore()
  return normalizeRateLimit(store.rateLimit)
}

export async function saveRateLimitState(
  state: StoredRateLimit,
): Promise<void> {
  const store = await ensureStore()
  store.rateLimit = normalizeRateLimit(state)
  await persist(store)
}

export async function replaceStoreData(
  incoming: Partial<StoreData> & { filters?: Partial<JobFilters> },
): Promise<StoreData> {
  const jobs: Record<string, StoredJob> = {}
  for (const [id, raw] of Object.entries(incoming.jobs ?? {})) {
    const job = raw as StoredJob
    jobs[id] = normalizeJob({ ...job, id: job.id || id })
  }

  const monitors = Array.isArray(incoming.monitors)
    ? incoming.monitors.map((m) => createMonitor(m))
    : []

  const current = await ensureStore()
  const next: StoreData = {
    jobs,
    monitors,
    rateLimit: normalizeRateLimit(incoming.rateLimit),
    settings: normalizeSettings(incoming.settings ?? current.settings),
    filters: normalizeJobFilters(incoming.filters ?? current.filters),
    theme: normalizeTheme(
      incoming.theme !== undefined ? incoming.theme : current.theme,
    ),
  }
  await persist(next, { allowEmptyOverwrite: true })
  return next
}
