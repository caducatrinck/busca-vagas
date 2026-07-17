import type { AppTab, JobStatus, Monitor } from '../lib/types'
import { formatBadgeCount } from '../lib/notificationsModel'
import type { ThemeMode } from '../hooks/useTheme'
import './Tabs.css'

type Props = {
  tab: AppTab
  jobsCount: number
  statusCounts: Record<JobStatus, number>
  monitors: Monitor[]
  unreadTotal: number
  setupRequired?: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  onChange: (tab: AppTab) => void
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.36 2.54c-.59.23-1.13.55-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.63 8.48a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.3.59.22l2.39-.96c.5.39 1.04.71 1.63.94l.36 2.54c.05.24.25.42.49.42h4c.24 0 .44-.18.49-.42l.36-2.54c.59-.23 1.13-.55 1.63-.94l2.39.96c.22.08.46 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z" />
    </svg>
  )
}

export function Tabs({
  tab,
  jobsCount,
  statusCounts,
  monitors,
  unreadTotal,
  setupRequired = false,
  theme,
  onToggleTheme,
  onChange,
}: Props) {
  const activeMonitors = monitors.filter((m) => m.pollingEnabled).length
  const runningMonitors = monitors.filter((m) => m.ticking).length
  const monitorMeta = setupRequired
    ? 'Bloqueado'
    : monitors.length === 0
      ? 'Criar busca'
      : runningMonitors > 0
        ? `${runningMonitors} buscando`
        : activeMonitors > 0
          ? `${activeMonitors} pooling`
          : `${monitors.length} busca${monitors.length === 1 ? '' : 's'}`

  const pendingCount = statusCounts.viewed
  const jobsMeta = setupRequired
    ? 'Bloqueado'
    : jobsCount === 0
      ? 'Banco local'
      : `${jobsCount} no total`

  const jobsNotifBadge = setupRequired ? null : formatBadgeCount(unreadTotal)
  const pendingBadge =
    !setupRequired && jobsCount > 0 && pendingCount > 0 && !jobsNotifBadge
      ? String(pendingCount)
      : null

  return (
    <header className="app-nav">
      <div className="app-nav__brand">
        <div className="app-nav__brand-text">
          <p className="app-nav__mark">Busca Vagas</p>
        </div>
        <div className="app-nav__actions">
          <button
            type="button"
            className="app-nav__icon-btn"
            aria-label={
              theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'
            }
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className={`app-nav__icon-btn app-nav__settings${setupRequired ? ' app-nav__settings--need' : ''}${tab === 'settings' ? ' app-nav__icon-btn--active' : ''}`}
            aria-label="Configurações"
            aria-pressed={tab === 'settings'}
            title="Configurações"
            onClick={() => onChange('settings')}
          >
            <GearIcon />
          </button>
        </div>
      </div>

      {setupRequired ? (
        <p className="app-nav__lock" role="status">
          Informe o cookie <code>li_at</code> em Configurações para liberar o
          app.
        </p>
      ) : null}

      <nav className="app-nav__switch" aria-label="Seções">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monitor'}
          aria-disabled={setupRequired}
          disabled={setupRequired}
          className={`app-nav__tab${tab === 'monitor' ? ' app-nav__tab--active' : ''}${activeMonitors > 0 && !setupRequired ? ' app-nav__tab--pooling' : ''}${runningMonitors > 0 && !setupRequired ? ' app-nav__tab--running' : ''}`}
          onClick={() => onChange('monitor')}
        >
          <span className="app-nav__label">
            Monitor
            {activeMonitors > 0 && !setupRequired ? (
              <span
                className={`app-nav__live${runningMonitors > 0 ? ' app-nav__live--running' : ''}`}
                title={
                  runningMonitors > 0
                    ? 'Buscando vagas agora'
                    : 'Pooling ativo'
                }
              />
            ) : null}
          </span>
          <span className="app-nav__meta">{monitorMeta}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'jobs'}
          aria-disabled={setupRequired}
          disabled={setupRequired}
          className={`app-nav__tab${tab === 'jobs' ? ' app-nav__tab--active' : ''}`}
          onClick={() => onChange('jobs')}
        >
          <span className="app-nav__label">
            Vagas
            {jobsNotifBadge ? (
              <span
                className="app-nav__alert-badge"
                title="Vagas novas no pooling"
                aria-label={`${unreadTotal} notificações não lidas`}
              >
                {jobsNotifBadge}
              </span>
            ) : pendingBadge ? (
              <span className="app-nav__count" title="Pendentes">
                {pendingBadge}
              </span>
            ) : null}
          </span>
          <span className="app-nav__meta">{jobsMeta}</span>
        </button>
      </nav>
    </header>
  )
}
