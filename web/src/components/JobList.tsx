import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type DescriptionLanguage,
  type Job,
  type JobFilters,
  type JobStatus,
  type SearchProgress,
} from '../lib/types'
import { matchesQuickFilter } from '../lib/filterJobs'
import { jobRecencyMs } from '../lib/formatPostedAt'
import { jobStatus } from '../lib/jobStatus'
import { isRateLimitError } from '../lib/rateLimit'
import { JobCard } from './JobCard'
import { SearchProgressCard } from './SearchProgressCard'
import './JobList.css'

type Props = {
  jobs: Job[]
  totalCount: number
  filters: JobFilters
  loading: boolean
  error: string | null
  emptyTitle?: string
  emptyHint?: string
  showDescriptionFilters?: boolean

  showTopFilters?: boolean

  showLanguageFilter?: boolean
  title?: string
  searchProgress?: SearchProgress | null
  fetchDescriptions?: boolean
  onCancelSearch?: () => void
  onStatusChange?: (job: Job, status: JobStatus) => void
  onDiscardAll?: (jobs: Job[]) => void | Promise<void>
  onLanguageChange?: (value: DescriptionLanguage) => void
}

const EMPTY_JOBS: Job[] = []

const LANGUAGE_OPTIONS: Array<{ value: DescriptionLanguage; label: string }> =
  [
    { value: '', label: 'Qualquer' },
    { value: 'pt', label: 'Português' },
    { value: 'en', label: 'Inglês' },
  ]

function LanguageDropdown(props: {
  value: DescriptionLanguage
  onChange: (value: DescriptionLanguage) => void
}) {
  const { value, onChange } = props
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const selectedLabel = useMemo(() => {
    return LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? 'Qualquer'
  }, [value])

  useEffect(() => {
    if (!open) return

    function updatePos() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({
        top: r.bottom + 6,
        left: r.left,
        width: r.width,
      })
    }

    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)

    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="job-list__language-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="job-list__language-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="job-list__language-trigger-text">{selectedLabel}</span>
        <span className="job-list__language-trigger-caret" aria-hidden />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="job-list__language-menu"
              role="listbox"
              aria-label="Filtrar por idioma"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              }}
            >
              {LANGUAGE_OPTIONS.map((opt) => {
                const selected = opt.value === value
                return (
                  <button
                    key={opt.value || 'any'}
                    type="button"
                    className={`job-list__language-option${
                      selected ? ' job-list__language-option--selected' : ''
                    }`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function JobList({
  jobs,
  totalCount,
  filters,
  loading,
  error,
  emptyTitle = 'Nenhuma vaga',
  emptyHint = 'Nada para mostrar aqui ainda.',
  showDescriptionFilters = true,
  showTopFilters = false,
  showLanguageFilter = false,
  title = 'Vagas',
  searchProgress = null,
  fetchDescriptions = false,
  onCancelSearch,
  onStatusChange,
  onDiscardAll,
  onLanguageChange,
}: Props) {
  const searching = Boolean(searchProgress)
  const [titleQuery, setTitleQuery] = useState('')
  const [descriptionQuery, setDescriptionQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [discarding, setDiscarding] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const safeJobs = jobs ?? EMPTY_JOBS

  const visibleJobs = useMemo(() => {
    const filtered = showTopFilters
      ? safeJobs.filter(
          (job) =>
            matchesQuickFilter(job.title ?? '', titleQuery) &&
            matchesQuickFilter(job.description ?? '', descriptionQuery),
        )
      : safeJobs

    if (!showTopFilters) return filtered

    const now = Date.now()
    const dir = newestFirst ? -1 : 1
    return [...filtered].sort(
      (a, b) => dir * (jobRecencyMs(a, now) - jobRecencyMs(b, now)),
    )
  }, [
    safeJobs,
    titleQuery,
    descriptionQuery,
    showTopFilters,
    newestFirst,
  ])

  const discardable = useMemo(
    () => visibleJobs.filter((job) => jobStatus(job) !== 'discarded'),
    [visibleJobs],
  )

  const discardCount = discardable.length

  useEffect(() => {
    if (!confirmDiscard) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmDiscard(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDiscard])

  async function confirmDiscardAll() {
    if (!onDiscardAll || discardable.length === 0 || discarding) return
    setConfirmDiscard(false)
    setDiscarding(true)
    try {
      await onDiscardAll(discardable)
    } finally {
      setDiscarding(false)
    }
  }

  if (error && !loading && !searching) {
    const errorTitle = isRateLimitError(error)
      ? 'Busca bloqueada'
      : 'Não foi possível carregar'
    return (
      <div className="job-list job-list--state job-list--error">
        <h2>{errorTitle}</h2>
        <p>{error}</p>
      </div>
    )
  }

  if (searching && safeJobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list">
        <SearchProgressCard
          progress={searchProgress!}
          fetchDescriptions={fetchDescriptions}
          onCancel={onCancelSearch}
        />
      </div>
    )
  }

  if (loading && !searching && safeJobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list job-list--state">
        <div className="job-list__pulse" />
        <p>Carregando…</p>
      </div>
    )
  }

  if (!loading && !searching && safeJobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list job-list--state">
        <h2>{emptyTitle}</h2>
        <p>{emptyHint}</p>
      </div>
    )
  }

  const countLabel = showTopFilters
    ? visibleJobs.length !== safeJobs.length
      ? `${visibleJobs.length} de ${safeJobs.length}`
      : safeJobs.length !== totalCount && totalCount > 0
        ? `${safeJobs.length} de ${totalCount}`
        : `${visibleJobs.length} vaga${visibleJobs.length === 1 ? '' : 's'}`
    : `${visibleJobs.length} vaga${visibleJobs.length === 1 ? '' : 's'}`

  const hiddenByParentFilters =
    showTopFilters && safeJobs.length === 0 && totalCount > 0

  return (
    <section className={`job-list${searching ? ' job-list--loading' : ''}`}>
      {searching ? (
        <SearchProgressCard
          progress={searchProgress!}
          fetchDescriptions={fetchDescriptions}
          onCancel={onCancelSearch}
        />
      ) : null}

      <header className="job-list__header">
        <div className="job-list__heading">
          <h2>{title}</h2>
          <p className="job-list__count">{countLabel}</p>
        </div>
        {showTopFilters ? (
          <div className="job-list__toolbar">
            <label className="job-list__search">
              <input
                type="search"
                value={titleQuery}
                onChange={(e) => setTitleQuery(e.target.value)}
                placeholder="Filtrar título…"
                autoComplete="off"
                aria-label="Filtrar por título"
              />
            </label>
            <label className="job-list__search">
              <input
                type="search"
                value={descriptionQuery}
                onChange={(e) => setDescriptionQuery(e.target.value)}
                placeholder="Filtrar descrição…"
                autoComplete="off"
                aria-label="Filtrar por descrição"
              />
            </label>
            {showLanguageFilter && onLanguageChange ? (
              <label className="job-list__language">
                <span>Idioma</span>
                <LanguageDropdown
                  value={filters.language}
                  onChange={onLanguageChange}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="job-list__sort"
              onClick={() => setNewestFirst((v) => !v)}
              aria-label={
                newestFirst
                  ? 'Ordenar: mais recentes primeiro'
                  : 'Ordenar: mais antigas primeiro'
              }
              title={
                newestFirst
                  ? 'Mais recentes primeiro'
                  : 'Mais antigas primeiro'
              }
            >
              {newestFirst ? '↓' : '↑'}
            </button>
            {onDiscardAll ? (
              <button
                type="button"
                className="job-list__discard-all"
                disabled={discardCount === 0 || discarding || searching}
                onClick={() => setConfirmDiscard(true)}
              >
                {discarding
                  ? 'Descartando…'
                  : `Descartar todas${discardCount > 0 ? ` (${discardCount})` : ''}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="job-list__scroll">
        {visibleJobs.length === 0 ? (
          <div className="job-list__empty job-list--state job-list--state-inline">
            <h2>
              {hiddenByParentFilters
                ? emptyTitle
                : showTopFilters
                  ? 'Nenhuma vaga neste filtro'
                  : emptyTitle}
            </h2>
            <p>
              {hiddenByParentFilters
                ? `${totalCount} vaga(s) ocultadas pelos filtros.`
                : showTopFilters
                  ? 'Ajuste o título/descrição ou limpe os filtros acima.'
                  : safeJobs.length === 0 && totalCount > 0
                    ? 'Nenhuma vaga para exibir no momento.'
                    : emptyHint}
            </p>
          </div>
        ) : (
          <div className="job-list__grid">
            {visibleJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                filters={filters}
                showDescriptionFilters={showDescriptionFilters}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {confirmDiscard ? (
        <div
          className="job-list__modal-backdrop"
          role="presentation"
          onClick={() => setConfirmDiscard(false)}
        >
          <div
            className="job-list__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-all-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="discard-all-title">Descartar todas?</h3>
            <p>
              Marcar{' '}
              <strong>
                {discardCount} vaga{discardCount === 1 ? '' : 's'}
              </strong>{' '}
              como descartada{discardCount === 1 ? '' : 's'}? Elas saem do
              Monitor e vão para a aba Descartadas.
            </p>
            <div className="job-list__modal-actions">
              <button
                type="button"
                className="job-list__modal-cancel"
                onClick={() => setConfirmDiscard(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="job-list__modal-confirm"
                onClick={() => void confirmDiscardAll()}
              >
                Sim, descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
