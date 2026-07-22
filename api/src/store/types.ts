import type { Job, SearchParams, SearchRunStats } from '../types.js'
import type { AppTag } from '../shared/tags.js'

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
  lastRunMode: 'manual' | 'pooling' | null
  knownIdsAtStart: string[]
  lastRunStats: SearchRunStats | null
  language: '' | 'pt' | 'en'
  selectedTagIds: string[]
  excludedTagIds: string[]
  descriptionFilters?: DescriptionFilters
}

export type StoredRateLimit = {
  events: number[]
  lastSearchAt: number | null
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
  rateLimitDefaultsRev: number
}

export const RATE_LIMIT_DEFAULTS_REV = 2

export type JobFilters = {
  excludeTitle: string[]
  includeTitle: string[]
  excludeDescription: string[]
  includeDescription: string[]
  language: '' | 'pt' | 'en'
  selectedTagIds: string[]
  excludedTagIds: string[]
}

export type DescriptionFilters = {
  excludeDescription: string[]
  includeDescription: string[]
  language: '' | 'pt' | 'en'
}

export type ThemeMode = 'light' | 'dark'

export type AppLocale = 'pt' | 'en'

export type UiPrefs = {
  filters: JobFilters
  theme: ThemeMode
  locale: AppLocale
}

export type StoreData = {
  jobs: Record<string, StoredJob>
  monitors: Monitor[]
  rateLimit: StoredRateLimit
  settings: AppSettings
  filters: JobFilters
  theme: ThemeMode
  locale: AppLocale
  tags: AppTag[]
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
