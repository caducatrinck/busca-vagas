import type { Monitor } from '../../lib/types'
import { tabCountdownLabel } from './formatCountdown'

type Props = {
  monitors: Monitor[]
  activeId: string | null
  searching: boolean
  busy: boolean
  now: number
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
}

export function MonitorTabs({
  monitors,
  activeId,
  searching,
  busy,
  now,
  onSelect,
  onAdd,
  onClose,
}: Props) {
  return (
    <div className="monitor-tabs">
      {monitors.map((monitor) => {
        const running =
          monitor.ticking || (searching && monitor.id === activeId)
        const eta =
          monitor.pollingEnabled || running
            ? tabCountdownLabel(monitor.nextRunAt, now, running)
            : null
        const titleBase = monitor.search.query || monitor.name
        return (
          <div
            key={monitor.id}
            className={`monitor-tabs__item${monitor.id === activeId ? ' monitor-tabs__item--active' : ''}${monitor.pollingEnabled ? ' monitor-tabs__item--pooling' : ''}${running ? ' monitor-tabs__item--running' : ''}`}
          >
            <button
              type="button"
              className="monitor-tabs__btn"
              onClick={() => onSelect(monitor.id)}
              title={
                running
                  ? `${titleBase} · buscando agora`
                  : eta === 'agora'
                    ? `${titleBase} · próxima busca iminente`
                    : eta
                      ? `${titleBase} · próxima ${eta}`
                      : titleBase
              }
            >
              <span className="monitor-tabs__text">
                <span className="monitor-tabs__label">
                  {monitor.search.query?.trim() || monitor.name}
                </span>
                {running ? (
                  <span className="monitor-tabs__eta monitor-tabs__eta--spin">
                    <span className="monitor-tabs__spinner" aria-hidden="true" />
                    buscando
                  </span>
                ) : eta ? (
                  <span className="monitor-tabs__eta" aria-hidden="true">
                    {eta}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="monitor-tabs__close"
              title="Fechar aba"
              aria-label={`Fechar ${titleBase}`}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onClose(monitor.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="monitor-tabs__add"
        onClick={onAdd}
        disabled={busy}
        title="Adicionar monitor"
        aria-label="Adicionar monitor"
      >
        <svg
          className="monitor-tabs__add-icon"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M5.25 1.5h1.5v3.75H10.5v1.5H6.75V10.5h-1.5V6.75H1.5v-1.5h3.75V1.5z"
          />
        </svg>
      </button>
    </div>
  )
}
