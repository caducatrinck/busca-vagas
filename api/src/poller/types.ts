import type { Monitor, StoredJob } from '../store.js'
import type { SearchProgressCallback } from '../types.js'

export type MonitorStatus = Monitor & {
  ticking: boolean
  nextRunAt: string | null
}

export type MonitorRunCallbacks = {
  onProgress?: SearchProgressCallback
  onJobs?: (jobs: Array<StoredJob & { isNew?: boolean }>) => void
}

export type MonitorRunMode = 'manual' | 'pooling'

export type MonitorRunResult = {
  newCount: number
  error?: string
  cancelled?: boolean
  retryAfterMs?: number
}
