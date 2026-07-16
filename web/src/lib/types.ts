export type PostedWithin = '24h' | 'week' | 'month'

export type AppTab = 'monitor' | 'jobs' | 'settings'

export type JobStatus = 'viewed' | 'applied' | 'discarded'

export type Job = {
  id: string
  title: string
  company: string
  location: string
  description: string
  url: string
  postedAt?: string
  status?: JobStatus
  applied?: boolean
  firstSeenAt?: string
  lastSeenAt?: string
  isNew?: boolean
  monitorIds?: string[]
}

export type WordFilterKey =
  | 'excludeTitle'
  | 'includeTitle'
  | 'excludeDescription'
  | 'includeDescription'

export type DescriptionLanguage = '' | 'pt' | 'en'

export type JobFilters = {
  excludeTitle: string[]
  includeTitle: string[]
  excludeDescription: string[]
  includeDescription: string[]

  language: DescriptionLanguage
}

export type SearchForm = {
  query: string
  location: string
  postedWithin: PostedWithin
  fetchDescriptions: boolean
}

export type SearchRunStats = {
  jobCount: number
  newCount: number
  durationMs: number
  finishedAt: string
  cancelled: boolean
  linkedinResponded?: boolean
  listingRequests?: number
  listingPagesWithJobs?: number
  emptyReason?: string
}

export type Monitor = {
  id: string
  name: string
  search: SearchForm
  pollingEnabled: boolean
  intervalMinutes: number
  lastRunAt: string | null
  lastError: string | null
  newCountLastRun: number
  knownIdsAtStart: string[]
  lastRunStats?: SearchRunStats | null
  ticking: boolean
  nextRunAt: string | null
}

export type SearchProgressPhase =
  | 'listing'
  | 'descriptions'
  | 'saving'
  | 'done'
  | 'error'

export type SearchProgress = {
  phase: SearchProgressPhase
  overallPercent: number
  listing: { current: number; total: number | null }
  descriptions: { current: number; total: number }
  label: string
  message?: string
  startedAt: number
  elapsedMs: number
  etaSeconds: number | null
  cancelled?: boolean
}

export const EMPTY_FILTERS: JobFilters = {
  excludeTitle: [],
  includeTitle: [],
  excludeDescription: [],
  includeDescription: [],
  language: '',
}

export const EMPTY_SEARCH: SearchForm = {
  query: '',
  location: '',
  postedWithin: 'week',
  fetchDescriptions: false,
}

export function monitorToSearch(monitor: Monitor | null | undefined): SearchForm {
  if (!monitor?.search) return { ...EMPTY_SEARCH }
  return {
    query: monitor.search.query ?? '',
    location: monitor.search.location ?? '',
    postedWithin: monitor.search.postedWithin ?? 'week',
    fetchDescriptions: Boolean(monitor.search.fetchDescriptions),
  }
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) return `${s}s`
  return `${m}m${String(s).padStart(2, '0')}s`
}

export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null
  if (seconds < 60) return `~${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `~${m}m${String(s).padStart(2, '0')}s` : `~${m}m`
}

export function formatLastRunStats(stats: SearchRunStats): string {
  const duration = formatDuration(stats.durationMs)
  const base = `${stats.jobCount} vaga${stats.jobCount === 1 ? '' : 's'}`
  const news =
    stats.newCount > 0
      ? ` · ${stats.newCount} nova${stats.newCount === 1 ? '' : 's'}`
      : ''
  const source =
    stats.listingRequests != null
      ? ` · LinkedIn ${stats.linkedinResponded ? 'ok' : 'sem resposta'} (${stats.listingRequests} req)`
      : ''
  const cancel = stats.cancelled ? ' · cancelada' : ''
  return `${base}${news} · ${duration}${source}${cancel}`
}
