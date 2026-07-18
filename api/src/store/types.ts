import type { Job, SearchParams, SearchRunStats } from '../types.js'

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
