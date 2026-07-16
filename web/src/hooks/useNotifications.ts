import { useEffect, useMemo, useRef, useState } from 'react'
import { BASE_TITLE, MAX_NOTIFICATIONS } from '../lib/monitorHelpers'
import { notifyNewJobs } from '../lib/notifications'
import {
  unreadByMonitor,
  unreadJobCount,
  type AppNotification,
} from '../lib/notificationsModel'
import { playNewJobsAlert } from '../lib/sound'
import type { Monitor } from '../lib/types'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const notifiedRunsRef = useRef<Set<string>>(new Set())
  const seededNotifyRef = useRef(false)

  const unreadTotal = useMemo(
    () => unreadJobCount(notifications),
    [notifications],
  )
  const unreadMap = useMemo(
    () => unreadByMonitor(notifications),
    [notifications],
  )

  useEffect(() => {
    if (unreadTotal <= 0) {
      document.title = BASE_TITLE
      return
    }
    document.title = `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${BASE_TITLE}`
    return () => {
      document.title = BASE_TITLE
    }
  }, [unreadTotal])

  function announceNewJobs(
    monitor: Monitor,
    onOpen: (item: AppNotification) => void,
  ) {
    if (monitor.newCountLastRun <= 0) return
    const name = monitor.search.query?.trim() || monitor.name
    const count = monitor.newCountLastRun
    const item: AppNotification = {
      id: `${monitor.id}-${monitor.lastRunAt ?? Date.now()}`,
      monitorId: monitor.id,
      monitorName: name,
      count,
      createdAt: Date.now(),
      read: false,
    }
    setNotifications((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS))
    setNotificationsOpen(true)
    playNewJobsAlert()
    notifyNewJobs({
      title:
        count === 1
          ? '1 vaga nova no pooling'
          : `${count} vagas novas no pooling`,
      body: `${name} — clique para abrir a busca`,
      tag: `busca-vagas-${monitor.id}`,
      onClick: () => {
        onOpen(item)
      },
    })
  }

  function openMonitorFromNotification(
    item: AppNotification,
    monitors: Monitor[],
    onNavigate: (monitor: Monitor | null, item: AppNotification) => void,
  ) {
    const monitor = monitors.find((m) => m.id === item.monitorId) ?? null
    onNavigate(monitor, item)
    setNotifications((prev) =>
      prev.map((n) =>
        n.monitorId === item.monitorId ? { ...n, read: true } : n,
      ),
    )
    setNotificationsOpen(false)
  }

  function markMonitorRead(monitorId: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.monitorId === monitorId ? { ...n, read: true } : n)),
    )
  }

  function handleMarkAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  function clearNotifications() {
    setNotifications([])
  }

  return {
    notifications,
    notificationsOpen,
    setNotificationsOpen,
    unreadTotal,
    unreadMap,
    announceNewJobs,
    openMonitorFromNotification,
    markMonitorRead,
    handleMarkAllNotificationsRead,
    clearNotifications,
    notifiedRunsRef,
    seededNotifyRef,
  }
}
