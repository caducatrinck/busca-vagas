export type AppNotification = {
  id: string
  monitorId: string
  monitorName: string
  count: number
  createdAt: number
  read: boolean
}

export function formatBadgeCount(n: number): string {
  if (n <= 0) return ''
  if (n > 99) return '99+'
  return String(n)
}

export function unreadJobCount(notifications: AppNotification[]): number {
  return notifications
    .filter((n) => !n.read)
    .reduce((sum, n) => sum + n.count, 0)
}

export function unreadByMonitor(
  notifications: AppNotification[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const n of notifications) {
    if (n.read) continue
    map[n.monitorId] = (map[n.monitorId] ?? 0) + n.count
  }
  return map
}
