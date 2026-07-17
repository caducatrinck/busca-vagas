import type {
  AppSettings,
  JobStatus,
  Monitor,
  StoredJob,
  StoreData,
  StoredRateLimit,
  UiPrefs,
} from '../store.js'
import type { Job, SearchParams, SearchRunStats } from '../types.js'

export type JobRepository = {
  listJobs(filter?: {
    status?: JobStatus
    appliedOnly?: boolean
    monitorId?: string
    excludeDiscarded?: boolean
  }): Promise<StoredJob[]>
  setJobStatus(id: string, status: JobStatus): Promise<StoredJob | null>
  setJobApplied(id: string, applied: boolean): Promise<StoredJob | null>
  deleteJobsByStatus(status: JobStatus): Promise<number>
  upsertSearchResults(
    jobs: Job[],
    monitorId?: string,
  ): Promise<{ jobs: StoredJob[]; newJobs: StoredJob[] }>
  withNewFlag(jobs: StoredJob[], newIds: string[]): Array<StoredJob & { isNew?: boolean }>
  getJobSearchHints(): Promise<{
    discardedIds: Set<string>
    knownDescriptions: Map<string, string>
    knownWorkplaceTypes: Map<string, Job['workplaceType']>
  }>
}

export type MonitorRepository = {
  listMonitors(): Promise<Monitor[]>
  getMonitor(id: string): Promise<Monitor | null>
  createMonitor(partial?: Partial<Monitor>): Promise<Monitor>
  updateMonitor(
    id: string,
    patch: Partial<Omit<Monitor, 'id'>> & { search?: SearchParams | null },
  ): Promise<Monitor | null>
  deleteMonitor(id: string): Promise<boolean>
}

export type SettingsRepository = {
  getAppSettings(): Promise<AppSettings>
  updateAppSettings(
    patch: Partial<AppSettings> & {
      clearLinkedinLiAt?: boolean
      clearLinkedinJsessionId?: boolean
    },
  ): Promise<AppSettings>
  isAppConfigured(settings?: AppSettings): boolean | Promise<boolean>
  toPublicSettings(settings: AppSettings): unknown
}

export type StoreRepository = JobRepository &
  MonitorRepository &
  SettingsRepository & {
    exportStoreData(): Promise<StoreData>
    replaceStoreData(incoming: Partial<StoreData>): Promise<StoreData>
    getRateLimitState(): Promise<StoredRateLimit>
    saveRateLimitState(state: StoredRateLimit): Promise<void>
    getStore(): Promise<StoreData>
    getUiPrefs(): Promise<UiPrefs>
    updateUiPrefs(patch: Partial<UiPrefs>): Promise<UiPrefs>
  }

export type { SearchRunStats }
