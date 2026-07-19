import { randomUUID } from 'node:crypto'
import type { Job } from '../types.js'
import { parseContractTags, resolveWorkplaceType } from '../types.js'
import {
  RATE_LIMIT_DEFAULTS_REV,
  type AppSettings,
  type DescriptionFilters,
  type JobFilters,
  type JobStatus,
  type Monitor,
  type StoredJob,
  type StoredRateLimit,
  type ThemeMode,
} from './types.js'

export const DEFAULT_RATE_LIMIT: StoredRateLimit = {
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

export function normalizeLocale(raw?: unknown): import('./types.js').AppLocale {
  return raw === 'en' ? 'en' : 'pt'
}

/**
 * DevTools às vezes copia o valor com aspas (`"ajax:…"`).
 * Remove aspas externas (retas ou tipográficas) sem alterar o miolo.
 */
export function normalizeCookieValue(raw?: string | null): string {
  let value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''

  for (let i = 0; i < 4; i++) {
    const first = value[0]
    const last = value[value.length - 1]
    const paired =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '\u201C' && last === '\u201D') ||
      (first === '\u2018' && last === '\u2019')
    if (!paired || value.length < 2) break
    value = value.slice(1, -1).trim()
  }
  return value
}

/** JSESSIONID do LinkedIn costuma ser `ajax:…` (DevTools pode vir com aspas). */
export function isLikelyLinkedInJsessionId(raw?: string | null): boolean {
  const value = normalizeCookieValue(raw)
  if (!value) return true // vazio = opcional no form; probe trata incomplete
  return /^ajax:\S+$/i.test(value)
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

export function migrateCookiesFromLegacyEnv(settings: AppSettings): AppSettings {
  const liAt =
    normalizeCookieValue(settings.linkedinLiAt) ||
    normalizeCookieValue(process.env.LINKEDIN_LI_AT) ||
    ''
  const jsession =
    normalizeCookieValue(settings.linkedinJsessionId) ||
    normalizeCookieValue(process.env.LINKEDIN_JSESSIONID) ||
    ''
  if (liAt === settings.linkedinLiAt && jsession === settings.linkedinJsessionId) {
    return settings
  }
  return { ...settings, linkedinLiAt: liAt, linkedinJsessionId: jsession }
}

export function normalizeSettings(
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
      typeof raw.linkedinLiAt === 'string'
        ? normalizeCookieValue(raw.linkedinLiAt)
        : base.linkedinLiAt,
    linkedinJsessionId:
      typeof raw.linkedinJsessionId === 'string'
        ? normalizeCookieValue(raw.linkedinJsessionId)
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

export function resolveStatus(
  job: Partial<StoredJob> & { applied?: boolean; status?: JobStatus },
): JobStatus {
  if (job.status === 'viewed' || job.status === 'applied' || job.status === 'discarded') {
    return job.status
  }
  return job.applied ? 'applied' : 'viewed'
}

export function normalizeJob(job: Partial<StoredJob> & Job): StoredJob {
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

export function createMonitor(partial?: Partial<Monitor>): Monitor {
  const id = partial?.id || randomUUID()
  return {
    id,
    name: partial?.name?.trim() || 'Monitor',
    search: {
      query: partial?.search?.query ?? '',
      location: partial?.search?.location?.trim() || 'Brasil',
      postedWithin: partial?.search?.postedWithin ?? '3d',
      fetchDescriptions: partial?.search?.fetchDescriptions ?? true,
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

export function normalizeRateLimit(raw?: Partial<StoredRateLimit> | null): StoredRateLimit {
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
