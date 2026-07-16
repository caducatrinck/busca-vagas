export type NotificationPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission as 'default' | 'granted' | 'denied'
}

export async function ensureNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermission()
  if (current !== 'default') return current
  try {
    const result = await Notification.requestPermission()
    return result as NotificationPermissionState
  } catch {
    return 'denied'
  }
}

export function notifyNewJobs(input: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}): void {
  if (getNotificationPermission() !== 'granted') return

  try {
    const n = new Notification(input.title, {
      body: input.body,
      tag: input.tag ?? 'busca-vagas-new',
      renotify: true,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      input.onClick?.()
      n.close()
    }
  } catch {

  }
}
