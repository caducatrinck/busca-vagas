import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fetchMonitors, fetchRateLimit, type RateLimitInfo } from '../lib/api'
import { msUntilNextPoolCheck, runKey } from '../lib/monitorHelpers'
import type { AppNotification } from '../lib/notificationsModel'
import {
  monitorToSearch,
  type AppTab,
  type Monitor,
  type SearchForm,
} from '../lib/types'

export function useMonitorPolling(params: {
  monitors: Monitor[]
  setupRequired: boolean
  tab: AppTab
  activeMonitorId: string | null
  setMonitors: Dispatch<SetStateAction<Monitor[]>>
  setActiveMonitorId: Dispatch<SetStateAction<string | null>>
  setMonitorDraft: Dispatch<SetStateAction<SearchForm>>
  loadMonitorJobs: (id: string) => Promise<void>
  loadSaved: () => Promise<void>
  announceNewJobs: (
    monitor: Monitor,
    onOpenMonitor: (item: AppNotification) => void,
  ) => void
  onOpenMonitor: (item: AppNotification) => void
}) {
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const notifiedRunsRef = useRef<Set<string>>(new Set())
  const seededNotifyRef = useRef(false)
  const activeMonitorIdRef = useRef<string | null>(null)
  activeMonitorIdRef.current = params.activeMonitorId

  useEffect(() => {
    void fetchRateLimit().then(setRateLimit)
  }, [])

  useEffect(() => {
    if (params.tab !== 'monitor' || params.setupRequired) return
    if (rateLimit?.allowed === false) {
      const id = window.setInterval(() => {
        void fetchRateLimit().then(setRateLimit)
      }, 15_000)
      return () => window.clearInterval(id)
    }
    void fetchRateLimit().then(setRateLimit)
  }, [params.tab, params.setupRequired, rateLimit?.allowed])

  function seedNotified(monitors = params.monitors) {
    for (const m of monitors) {
      const key = runKey(m)
      if (key) notifiedRunsRef.current.add(key)
    }
    seededNotifyRef.current = true
  }

  useEffect(() => {
    if (params.setupRequired) return
    const anyActive = params.monitors.some((m) => m.pollingEnabled)
    if (!anyActive) return

    let cancelled = false
    let timeoutId = 0
    const monitorsRef = { current: params.monitors }

    function scheduleNext(list: Monitor[]) {
      if (cancelled) return
      monitorsRef.current = list
      const delay = msUntilNextPoolCheck(list)
      timeoutId = window.setTimeout(() => {
        void tick()
      }, delay)
    }

    async function tick() {
      try {
        const list = await fetchMonitors()
        if (cancelled) return

        let completedRun = false

        if (!seededNotifyRef.current) {
          for (const m of list) {
            const key = runKey(m)
            if (key) notifiedRunsRef.current.add(key)
          }
          seededNotifyRef.current = true
        } else {
          for (const m of list) {
            if (!m.pollingEnabled) continue
            const key = runKey(m)
            if (!key || notifiedRunsRef.current.has(key)) continue
            notifiedRunsRef.current.add(key)
            completedRun = true
            if (m.newCountLastRun > 0) {
              params.announceNewJobs(m, params.onOpenMonitor)
            }
          }
        }

        params.setMonitors((prev) => {
          if (
            prev.length === list.length &&
            prev.every((m, i) => {
              const n = list[i]
              return (
                m.id === n.id &&
                m.lastRunAt === n.lastRunAt &&
                m.nextRunAt === n.nextRunAt &&
                m.pollingEnabled === n.pollingEnabled &&
                m.newCountLastRun === n.newCountLastRun &&
                m.lastError === n.lastError &&
                m.ticking === n.ticking
              )
            })
          ) {
            return prev
          }
          return list
        })

        const preferred = activeMonitorIdRef.current
        const nextId =
          preferred && list.some((m) => m.id === preferred)
            ? preferred
            : list[0]?.id ?? null
        if (nextId !== preferred) {
          params.setActiveMonitorId(nextId)
          params.setMonitorDraft(
            monitorToSearch(list.find((m) => m.id === nextId)),
          )
        }

        if (completedRun) {
          if (nextId) await params.loadMonitorJobs(nextId)
          await params.loadSaved()
          setRateLimit(await fetchRateLimit())
        }

        scheduleNext(list)
      } catch {
        if (!cancelled) scheduleNext(monitorsRef.current)
      }
    }

    void tick()

    function onVisible() {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timeoutId)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.setupRequired, params.monitors.some((m) => m.pollingEnabled)])

  return { rateLimit, setRateLimit, seedNotified }
}
