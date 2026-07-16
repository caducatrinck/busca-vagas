export type PostedWithin = '24h' | 'week' | 'month'

export type JobStatus = 'viewed' | 'applied' | 'discarded'

export type Job = {
  id: string
  title: string
  company: string
  location: string
  description: string
  url: string
  postedAt?: string
}

export type SearchParams = {
  query: string
  location?: string
  postedWithin?: PostedWithin
  postedWithinSeconds?: number
  fetchDescriptions?: boolean
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

export type SearchProgressCallback = (progress: SearchProgress) => void
