import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { Job, SearchParams, SearchRunStats } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const STORE_PATH = path.join(DATA_DIR, 'store.json')

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
  knownIdsAtStart: string[]
  lastRunStats: SearchRunStats | null
}

export type StoredRateLimit = {
  events: number[]
  lastSearchAt: number | null
}

export type AppSettings = {
  linkedinLiAt: string
  linkedinJsessionId: string
  linkedinMaxPages: number
  searchCooldownMs: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
}

export type StoreData = {
  jobs: Record<string, StoredJob>
  monitors: Monitor[]
  rateLimit: StoredRateLimit
  settings: AppSettings
}

const DEFAULT_RATE_LIMIT: StoredRateLimit = {
  events: [],
  lastSearchAt: null,
}

export function defaultAppSettings(): AppSettings {
  return {
    linkedinLiAt: '',
    linkedinJsessionId: '',
    linkedinMaxPages: 1000,
    searchCooldownMs: 5_000,
    maxSearchesPerHour: 60,
    maxSearchesPerDay: 300,
    jobDetailConcurrency: 5,
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

function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  const base = defaultAppSettings()
  if (!raw || typeof raw !== 'object') return base
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
    searchCooldownMs: Math.min(
      Math.max(Number(raw.searchCooldownMs) || base.searchCooldownMs, 0),
      600_000,
    ),
    maxSearchesPerHour: Math.min(
      Math.max(Number(raw.maxSearchesPerHour) || base.maxSearchesPerHour, 1),
      500,
    ),
    maxSearchesPerDay: Math.min(
      Math.max(Number(raw.maxSearchesPerDay) || base.maxSearchesPerDay, 1),
      2000,
    ),
    jobDetailConcurrency: Math.min(
      Math.max(Number(raw.jobDetailConcurrency) || base.jobDetailConcurrency, 1),
      20,
    ),
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
    searchCooldownMs: 5_000,
    maxSearchesPerHour: 60,
    maxSearchesPerDay: 300,
    jobDetailConcurrency: 5,
  },
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
  return {
    ...job,
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
      location: partial?.search?.location,
      postedWithin: partial?.search?.postedWithin ?? 'week',
      fetchDescriptions: Boolean(partial?.search?.fetchDescriptions),
    },
    pollingEnabled: Boolean(partial?.pollingEnabled),
    intervalMinutes: Math.min(Math.max(partial?.intervalMinutes ?? 5, 1), 120),
    lastRunAt: partial?.lastRunAt ?? null,
    nextRunAt: partial?.nextRunAt ?? null,
    lastError: partial?.lastError ?? null,
    newCountLastRun: partial?.newCountLastRun ?? 0,
    knownIdsAtStart: partial?.knownIdsAtStart ?? [],
    lastRunStats: partial?.lastRunStats ?? null,
  }
}

function normalizeRateLimit(raw?: Partial<StoredRateLimit> | null): StoredRateLimit {
  const events = Array.isArray(raw?.events)
    ? raw.events
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []
  const last = raw?.lastSearchAt
  return {
    events,
    lastSearchAt:
      typeof last === 'number' && Number.isFinite(last) && last > 0 ? last : null,
  }
}

async function ensureStore(): Promise<StoreData> {
  if (cache) return cache

  await mkdir(DATA_DIR, { recursive: true })

  try {
    const raw = await readFile(STORE_PATH, 'utf8')
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
      ? parsed.monitors.map((m) => createMonitor(m))
      : []

    if (monitors.length === 0 && parsed.poller?.search?.query) {
      monitors = [
        createMonitor({
          name: parsed.poller.search.query.slice(0, 28) || 'Monitor',
          search: parsed.poller.search,
          pollingEnabled: Boolean(parsed.poller.enabled),
          intervalMinutes: parsed.poller.intervalMinutes ?? 5,
          lastRunAt: parsed.poller.lastRunAt ?? null,
          lastError: parsed.poller.lastError ?? null,
          newCountLastRun: parsed.poller.newCountLastRun ?? 0,
          knownIdsAtStart: parsed.poller.knownIdsAtStart ?? [],
        }),
      ]
    }

    cache = {
      jobs,
      monitors,
      rateLimit: normalizeRateLimit(parsed.rateLimit),
      settings: migrateCookiesFromLegacyEnv(
        normalizeSettings((parsed as Partial<StoreData>).settings),
      ),
    }
  } catch {
    cache = {
      jobs: {},
      monitors: [],
      rateLimit: { ...DEFAULT_RATE_LIMIT },
      settings: migrateCookiesFromLegacyEnv(defaultAppSettings()),
    }
  }

  await persist(cache)
  return cache
}

async function persist(data: StoreData): Promise<void> {
  cache = data
  writeQueue = writeQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8')
  })
  await writeQueue
}

export async function getStore(): Promise<StoreData> {
  return ensureStore()
}

export async function getJobSearchHints(): Promise<{
  discardedIds: Set<string>
  knownDescriptions: Map<string, string>
}> {
  const store = await ensureStore()
  const discardedIds = new Set<string>()
  const knownDescriptions = new Map<string, string>()

  for (const job of Object.values(store.jobs)) {
    const normalized = normalizeJob(job)
    if (normalized.status === 'discarded') {
      discardedIds.add(normalized.id)
    }

    const description = normalized.description?.trim()
    if (description) {
      knownDescriptions.set(normalized.id, description)
    }
  }

  return { discardedIds, knownDescriptions }
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
        status,
        applied: status === 'applied',
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: now,
        monitorIds: [...monitorIds],
      }
      store.jobs[job.id] = merged
      result.push(merged)
    } else {
      const created: StoredJob = {
        ...job,
        status: 'viewed',
        applied: false,
        firstSeenAt: now,
        lastSeenAt: now,
        monitorIds: monitorId ? [monitorId] : [],
      }
      store.jobs[job.id] = created
      newJobs.push(created)
      result.push(created)
    }
  }

  await persist(store)
  return { jobs: result, newJobs }
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
  else if (typeof patch.linkedinLiAt === 'string' && patch.linkedinLiAt.trim()) {
    linkedinLiAt = patch.linkedinLiAt.trim()
  }

  let linkedinJsessionId = current.linkedinJsessionId
  if (patch.clearLinkedinJsessionId) linkedinJsessionId = ''
  else if (
    typeof patch.linkedinJsessionId === 'string' &&
    patch.linkedinJsessionId.trim()
  ) {
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

export async function exportStoreData(): Promise<StoreData> {
  const store = await ensureStore()
  return structuredClone(store)
}

export async function getRateLimitState(): Promise<StoredRateLimit> {
  const store = await ensureStore()
  return { ...store.rateLimit, events: [...store.rateLimit.events] }
}

export async function saveRateLimitState(
  state: StoredRateLimit,
): Promise<void> {
  const store = await ensureStore()
  store.rateLimit = normalizeRateLimit(state)
  await persist(store)
}

export async function replaceStoreData(
  incoming: Partial<StoreData>,
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
  }
  await persist(next)
  return next
}
