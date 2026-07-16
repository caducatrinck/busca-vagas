import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fetchMonitors, fetchRateLimit, type RateLimitInfo } from '../lib/api'
import { msUntilNextPoolCheck, runKey } from '../lib/monitorHelpers'
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
  activeMonitorIdRef: RefObject<string | null>
  setMonitors: Dispatch<SetStateAction<Monitor[]>>
  setActiveMonitorId: Dispatch<SetStateAction<string | null>>
  setMonitorDraft: Dispatch<SetStateAction<SearchForm>>
  loadMonitorJobs: (monitorId: string) => Promise<void>
  loadSaved: () => Promise<void>
  notifiedRunsRef: RefObject<Set<string>>
  seededNotifyRef: RefObject<boolean>
  onAnnounceNewJobs: (monitor: Monitor) => void
}) {
  const {
    monitors,
    setupRequired,
    tab,
    activeMonitorIdRef,
    setMonitors,
    setActiveMonitorId,
    setMonitorDraft,
    loadMonitorJobs,
    loadSaved,
    notifiedRunsRef,
    seededNotifyRef,
    onAnnounceNewJobs,
  } = params

  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const onAnnounceRef = useRef(onAnnounceNewJobs)
  onAnnounceRef.current = onAnnounceNewJobs

  useEffect(() => {
    void fetchRateLimit().then(setRateLimit)
  }, [])

  useEffect(() => {
    if (tab !== 'monitor' || setupRequired) return
    if (rateLimit?.allowed === false) {
      const id = window.setInterval(() => {
        void fetchRateLimit().then(setRateLimit)
      }, 15_000)
      return () => window.clearInterval(id)
    }
    void fetchRateLimit().then(setRateLimit)
  }, [tab, setupRequired, rateLimit?.allowed])

  useEffect(() => {
    if (setupRequired) return
    const anyActive = monitors.some((m) => m.pollingEnabled)
    if (!anyActive) return

    let cancelled = false
    let timeoutId = 0
    const monitorsRef = { current: monitors }

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
            if (m.newCountLastRun > 0) onAnnounceRef.current(m)
          }
        }

        setMonitors((prev) => {
          const safePrev = Array.isArray(prev) ? prev : []
          if (
            safePrev.length === list.length &&
            safePrev.every((m, i) => {
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
            return safePrev
          }
          return list
        })

        const preferred = activeMonitorIdRef.current
        const nextId =
          preferred && list.some((m) => m.id === preferred)
            ? preferred
            : list[0]?.id ?? null
        if (nextId !== preferred) {
          setActiveMonitorId(nextId)
          setMonitorDraft(monitorToSearch(list.find((m) => m.id === nextId)))
        }

        if (completedRun) {
          if (nextId) await loadMonitorJobs(nextId)
          await loadSaved()
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
  }, [setupRequired, monitors.some((m) => m.pollingEnabled)])

  return { rateLimit, setRateLimit }
}
