import { useEffect, useState } from 'react'
import {
  type DescriptionLanguage,
  type JobFilters,
  type Monitor,
  type SearchForm,
  type WordFilterKey,
} from '../lib/types'
import { formatRateLimitSummary } from '../lib/rateLimit'
import type { RateLimitInfo } from '../lib/api'
import { FilterTags } from './FilterTags'
import './SearchPanel.css'
import './PollingPanel.css'

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function clampInterval(minutes: number): number {
  return Math.min(Math.max(Number.isFinite(minutes) ? minutes : 20, 1), 120)
}

function poolingWindowMinutes(
  intervalMinutes: number,
  lastRunAt: string | null,
  now = Date.now(),
): number {
  const intervalSec = Math.max(1, intervalMinutes) * 60
  const waitedSec = lastRunAt
    ? Math.max(0, Math.floor((now - new Date(lastRunAt).getTime()) / 1000))
    : intervalSec
  const coverageSec = Math.max(waitedSec, intervalSec)
  const bufferSec = Math.max(10 * 60, Math.ceil(coverageSec * 0.5))
  const windowSec = coverageSec + bufferSec
  const clamped = Math.min(Math.max(windowSec, 10 * 60), 24 * 60 * 60)
  return Math.max(1, Math.round(clamped / 60))
}

function tabCountdownLabel(
  nextRunAt: string | null,
  now: number,
  running: boolean,
): string | null {
  if (!nextRunAt && !running) return null
  if (running) return 'buscando'
  if (!nextRunAt) return null
  const remaining = new Date(nextRunAt).getTime() - now
  if (remaining <= 0) return 'agora'
  return `em ${formatCountdown(remaining)}`
}

type Props = {
  monitors: Monitor[]
  activeId: string | null
  draft: SearchForm
  filters: JobFilters
  loading: boolean
  searching?: boolean
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onDraftChange: (next: SearchForm) => void
  onLanguageChange: (value: DescriptionLanguage) => void
  onTogglePolling: (enabled: boolean, intervalMinutes: number) => void
  onIntervalChange: (minutes: number) => void
  onRunNow: () => void
  onAddWord: (key: WordFilterKey, word: string) => void
  onRemoveWord: (key: WordFilterKey, word: string) => void
  rateLimit?: RateLimitInfo | null
}

export function PollingPanel({
  monitors,
  activeId,
  draft,
  filters,
  loading,
  searching = false,
  onSelect,
  onAdd,
  onClose,
  onDraftChange,
  onLanguageChange,
  onTogglePolling,
  onIntervalChange,
  onRunNow,
  onAddWord,
  onRemoveWord,
  rateLimit = null,
}: Props) {
  const busy = loading || searching
  const searchBlocked = rateLimit != null && !rateLimit.allowed
  const active = monitors.find((m) => m.id === activeId) ?? null
  const activeIntervalMinutes = active?.intervalMinutes
  const [intervalDraft, setIntervalDraft] = useState(
    () => activeIntervalMinutes ?? 20,
  )
  const [now, setNow] = useState(() => Date.now())
  const anyPolling = monitors.some((m) => m.pollingEnabled)

  useEffect(() => {
    if (activeIntervalMinutes != null) setIntervalDraft(activeIntervalMinutes)
  }, [activeId, activeIntervalMinutes])

  useEffect(() => {
    if (!anyPolling) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [anyPolling])

  function handleLanguageChange(value: DescriptionLanguage) {
    onLanguageChange(value)
  }

  function commitInterval(raw: number) {
    const safe = clampInterval(raw)
    setIntervalDraft(safe)
    if (active && safe !== active.intervalMinutes) {
      onIntervalChange(safe)
    }
  }

  return (
    <aside className="search-panel search-panel--compact">
      <div className="monitor-tabs">
        {monitors.map((monitor) => {
          const running =
            monitor.ticking || (searching && monitor.id === activeId)
          const eta =
            monitor.pollingEnabled || running
              ? tabCountdownLabel(monitor.nextRunAt, now, running)
              : null
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
                    ? `${monitor.search.query || monitor.name} · buscando agora`
                    : eta === 'agora'
                      ? `${monitor.search.query || monitor.name} · próxima busca iminente`
                      : eta
                        ? `${monitor.search.query || monitor.name} · próxima ${eta}`
                        : monitor.search.query || monitor.name
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
                aria-label={`Fechar ${monitor.search.query || monitor.name}`}
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
        >
          +
        </button>
      </div>

      {!active ? (
        <p className="search-panel__lead">
          Clique em <strong>+</strong> para criar a primeira busca.
        </p>
      ) : (
        <>
          <div className="search-panel__form monitor-poll">
            <div className="monitor-poll__row">
              <label className="search-panel__check">
                <input
                  type="checkbox"
                  checked={active.pollingEnabled}
                  disabled={busy || !draft.query.trim()}
                  onChange={(e) =>
                    onTogglePolling(e.target.checked, clampInterval(intervalDraft))
                  }
                />
                <span>Ativar pooling</span>
              </label>
              <label className="monitor-poll__minutes">
                <span>min</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={intervalDraft}
                  disabled={busy}
                  onChange={(e) =>
                    setIntervalDraft(Number(e.target.value) || 0)
                  }
                  onBlur={(e) => commitInterval(Number(e.target.value))}
                  aria-label="Intervalo em minutos"
                />
              </label>
            </div>
            {active.lastError ? (
              <p className="monitor-error">{active.lastError}</p>
            ) : null}
          </div>

          <div className="search-panel__form">
            <label>
              Palavras de busca
              <input
                value={draft.query}
                onChange={(e) =>
                  onDraftChange({ ...draft, query: e.target.value })
                }
                placeholder="Ex: React TypeScript"
              />
            </label>
            <label>
              Localização (opcional)
              <input
                value={draft.location}
                onChange={(e) =>
                  onDraftChange({ ...draft, location: e.target.value })
                }
                placeholder="Ex: Remoto, São Paulo — vazio = Brasil"
              />
            </label>
            <label>
              Publicadas em
              {active.pollingEnabled ? (
                <input
                  type="text"
                  readOnly
                  value={`Últimos ~${poolingWindowMinutes(active.intervalMinutes, active.lastRunAt, now)} min (pooling)`}
                  title="Janela automática do pooling (intervalo + margem). “Buscar agora” usa a mesma janela enquanto o pooling estiver ativo."
                />
              ) : (
                <select
                  value={draft.postedWithin}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      postedWithin: e.target.value as SearchForm['postedWithin'],
                    })
                  }
                >
                  <option value="24h">Últimas 24 horas</option>
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                </select>
              )}
            </label>

            <button
              type="button"
              className="search-panel__refresh"
              onClick={onRunNow}
              disabled={busy || !draft.query.trim() || searchBlocked}
              title={
                searchBlocked && rateLimit
                  ? formatRateLimitSummary(rateLimit)
                  : undefined
              }
            >
              {searching ? 'Buscando…' : 'Buscar agora'}
            </button>
            {searchBlocked && rateLimit ? (
              <p className="monitor-error monitor-rate-limit">
                {formatRateLimitSummary(rateLimit)}
              </p>
            ) : null}
          </div>

          <div className="search-panel__description">
            <div className="search-panel__form">
              <label>
                Idioma
                <select
                  value={filters.language}
                  onChange={(e) =>
                    handleLanguageChange(e.target.value as DescriptionLanguage)
                  }
                >
                  <option value="">Qualquer</option>
                  <option value="pt">Português</option>
                  <option value="en">Inglês</option>
                </select>
              </label>
            </div>

            <label className="search-panel__check">
              <input
                type="checkbox"
                checked={draft.fetchDescriptions}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    fetchDescriptions: e.target.checked,
                  })
                }
              />
              <span>Buscar e filtrar pela descrição</span>
            </label>

            {filters.language && !draft.fetchDescriptions ? (
              <p className="search-panel__alert" role="status">
                Para filtrar por idioma com precisão, ative a busca pela
                descrição.
              </p>
            ) : null}

            {draft.fetchDescriptions ? (
              <>
                <p className="search-panel__alert" role="status">
                  Ativado: primeiro lista todas as vagas; depois só busca
                  descrição das que ainda não têm no banco (as já lidas são
                  reaproveitadas).
                </p>
                <FilterTags
                  label="Excluir na descrição"
                  hint="Se a descrição tiver uma destas palavras, some."
                  words={filters.excludeDescription}
                  filterKey="excludeDescription"
                  onAdd={onAddWord}
                  onRemove={onRemoveWord}
                  tone="exclude"
                />
                <FilterTags
                  label="Exigir na descrição"
                  hint="Se preencher, a descrição precisa conter ao menos uma."
                  words={filters.includeDescription}
                  filterKey="includeDescription"
                  onAdd={onAddWord}
                  onRemove={onRemoveWord}
                  tone="include"
                />
              </>
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
