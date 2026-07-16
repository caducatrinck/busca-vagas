import { useEffect, useRef } from 'react'
import {
  formatBadgeCount,
  type AppNotification,
} from '../lib/notificationsModel'
import './NotificationBell.css'

type Props = {
  notifications: AppNotification[]
  open: boolean
  unreadTotal: number
  onToggle: () => void
  onOpenItem: (notification: AppNotification) => void
  onMarkAllRead: () => void
  onClose: () => void
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export function NotificationBell({
  notifications,
  open,
  unreadTotal,
  onToggle,
  onOpenItem,
  onMarkAllRead,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const badge = formatBadgeCount(unreadTotal)
  const items = [...notifications].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className={`notif-bell__btn${unreadTotal > 0 ? ' notif-bell__btn--alert' : ''}${open ? ' notif-bell__btn--open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificações"
        aria-label={
          unreadTotal > 0
            ? `Notificações, ${unreadTotal} não lidas`
            : 'Notificações'
        }
      >
        <span className="notif-bell__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path
              d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm7-5.5V11a7 7 0 1 0-14 0v5.5L3 18.5V20h18v-1.5l-2-2Z"
              fill="currentColor"
            />
          </svg>
        </span>
        {badge ? (
          <span className="notif-bell__badge" aria-hidden>
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-bell__panel" role="dialog" aria-label="Notificações">
          <div className="notif-bell__head">
            <p className="notif-bell__title">Notificações</p>
            {unreadTotal > 0 ? (
              <button
                type="button"
                className="notif-bell__mark"
                onClick={onMarkAllRead}
              >
                Marcar todas
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="notif-bell__empty">
              Nenhuma notificação ainda. Com o pooling ativo, avisamos quando
              aparecerem vagas novas.
            </p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notif-bell__item${!item.read ? ' notif-bell__item--unread' : ''}`}
                    onClick={() => onOpenItem(item)}
                  >
                    <span
                      className={`notif-bell__dot${!item.read ? ' notif-bell__dot--on' : ''}`}
                      aria-hidden
                    />
                    <span className="notif-bell__item-body">
                      <span className="notif-bell__item-title">
                        {item.count === 1
                          ? '1 vaga nova'
                          : `${item.count} vagas novas`}
                      </span>
                      <span className="notif-bell__item-sub">
                        {item.monitorName}
                      </span>
                    </span>
                    <span className="notif-bell__item-meta">
                      <span className="notif-bell__item-count">
                        {formatBadgeCount(item.count)}
                      </span>
                      <span className="notif-bell__item-time">
                        {timeAgo(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
