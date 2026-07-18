import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { BASE_TITLE, MAX_NOTIFICATIONS } from '../lib/monitorHelpers'
import { notifyNewJobs } from '../lib/notifications'
import {
  unreadJobCount,
  type AppNotification,
} from '../lib/notificationsModel'
import { playNewJobsAlert } from '../lib/sound'
import type { Monitor } from '../lib/types'

export function useNotifications() {
  const { t } = useI18n()
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const notifiedRunsRef = useRef<Set<string>>(new Set())
  const seededNotifyRef = useRef(false)

  const unreadTotal = useMemo(
    () => unreadJobCount(notifications),
    [notifications],
  )

  useEffect(() => {
    if (unreadTotal <= 0) {
      document.title = BASE_TITLE
    } else {
      document.title = `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${BASE_TITLE}`
    }
    window.buscaVagasDesktop?.setTrayBadge(unreadTotal)
    return () => {
      document.title = BASE_TITLE
    }
  }, [unreadTotal])

  useEffect(() => {
    return () => {
      window.buscaVagasDesktop?.setTrayBadge(0)
    }
  }, [])

  function announceNewJobs(
    monitor: Monitor,
    onOpen: (item: AppNotification) => void,
  ) {
    if (monitor.lastRunMode !== 'pooling') return
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
    playNewJobsAlert()
    notifyNewJobs({
      title:
        count === 1
          ? t('notify.one')
          : t('notify.many', { n: count }),
      body: t('notify.body', { name }),
      tag: `busca-vagas-${monitor.id}`,
      onClick: () => {
        onOpen(item)
      },
    })
  }

  function openFromNotification(
    item: AppNotification,
    onNavigate: (item: AppNotification) => void,
  ) {
    onNavigate(item)
    setNotifications((prev) =>
      prev.map((n) =>
        n.monitorId === item.monitorId ? { ...n, read: true } : n,
      ),
    )
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
    unreadTotal,
    announceNewJobs,
    openFromNotification,
    markMonitorRead,
    handleMarkAllNotificationsRead,
    clearNotifications,
    notifiedRunsRef,
    seededNotifyRef,
  }
}
