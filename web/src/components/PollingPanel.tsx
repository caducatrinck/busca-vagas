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
import { poolingWindowMinutes } from '../../../shared/poolingWindow'
import { FilterTags } from './FilterTags'
import { LanguageDropdown } from './LanguageDropdown'
import { NumberInput } from './NumberInput'
import { SelectDropdown } from './SelectDropdown'
import './SearchPanel.css'
import './PollingPanel.css'

const POSTED_WITHIN_OPTIONS: Array<{
  value: SearchForm['postedWithin']
  label: string
}> = [
  { value: '30m', label: 'Últimos 30 minutos' },
  { value: '1h', label: 'Última hora' },
  { value: '10h', label: 'Últimas 10 horas' },
  { value: '24h', label: 'Últimas 24 horas' },
  { value: 'week', label: 'Última semana' },
  { value: 'month', label: 'Último mês' },
]

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
  onPausePooling: () => void
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
  onPausePooling,
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
  const rateLimitMsg =
    rateLimit && searchBlocked ? formatRateLimitSummary(rateLimit, now) : null

  useEffect(() => {
    if (activeIntervalMinutes != null) setIntervalDraft(activeIntervalMinutes)
  }, [activeId, activeIntervalMinutes])

  useEffect(() => {
    if (!anyPolling && !searchBlocked) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [anyPolling, searchBlocked])

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

      {!active ? (
        <p className="search-panel__lead">
          Clique em <strong>+</strong> para criar a primeira busca.
        </p>
      ) : (
        <>
          <div className="search-panel__form monitor-poll">
            <div className="monitor-poll__row">
              <label className="monitor-poll__minutes">
                <span>Intervalo</span>
                <NumberInput
                  min={1}
                  max={120}
                  value={intervalDraft}
                  emptyValue={20}
                  disabled={busy}
                  onValueChange={(n) => commitInterval(n)}
                  aria-label="Intervalo do pooling em minutos"
                />
                <span>min</span>
              </label>
            </div>
            {active.lastError &&
            !/anti-spam|entre buscas|Aguarde \d+s/i.test(active.lastError) ? (
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
                placeholder="Ex: Remoto, São Paulo"
              />
            </label>
            <label>
              Publicadas em
              {active.pollingEnabled ? (
                <input
                  type="text"
                  disabled
                  value={`Últimos ${poolingWindowMinutes(active.intervalMinutes, active.lastRunAt, now)} min`}
                  aria-label="Publicadas em (definido pelo pooling)"
                />
              ) : (
                <SelectDropdown
                  fullWidth
                  value={draft.postedWithin}
                  options={POSTED_WITHIN_OPTIONS}
                  aria-label="Publicadas em"
                  onChange={(postedWithin) =>
                    onDraftChange({ ...draft, postedWithin })
                  }
                />
              )}
            </label>

            <button
              type="button"
              className={`search-panel__refresh${
                active.pollingEnabled && !searching
                  ? ' search-panel__refresh--pause'
                  : ''
              }`}
              onClick={() => {
                if (active.pollingEnabled && !searching) onPausePooling()
                else onRunNow()
              }}
              disabled={
                searching ||
                (!active.pollingEnabled &&
                  (!draft.query.trim() || searchBlocked))
              }
              title={
                searching
                  ? 'Busca em andamento'
                  : active.pollingEnabled
                    ? 'Pausa o pooling automático'
                    : rateLimitMsg
                      ? rateLimitMsg
                      : 'Busca agora e ativa o pooling automático'
              }
            >
              {searching
                ? 'Buscando…'
                : active.pollingEnabled
                  ? 'Pausar'
                  : 'Buscar agora'}
            </button>
            {rateLimitMsg && !active.pollingEnabled ? (
              <p className="monitor-error monitor-rate-limit">{rateLimitMsg}</p>
            ) : null}
          </div>

          <div className="search-panel__description">
            <div className="search-panel__form">
              <label>
                Idioma
                <LanguageDropdown
                  fullWidth
                  value={filters.language}
                  onChange={handleLanguageChange}
                />
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
