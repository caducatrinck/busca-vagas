import { useEffect, useMemo, useState } from 'react'
import {
  type DescriptionLanguage,
  type Job,
  type JobFilters,
  type JobStatus,
  type SearchProgress,
} from '../lib/types'
import { containsWholeWord } from '../lib/filterJobs'
import { isRateLimitError } from '../lib/rateLimit'
import { JobCard, jobStatus } from './JobCard'
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

function matchesTextQuery(job: Job, query: string): boolean {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = `${job.title ?? ''}\n${job.description ?? ''}`
  return tokens.every((token) => containsWholeWord(haystack, token))
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
  const [textQuery, setTextQuery] = useState('')
  const [discarding, setDiscarding] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const visibleJobs = useMemo(
    () =>
      showTopFilters
        ? jobs.filter((job) => matchesTextQuery(job, textQuery))
        : jobs,
    [jobs, textQuery, showTopFilters],
  )

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

  if (searching && jobs.length === 0 && totalCount === 0) {
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

  if (loading && !searching && jobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list job-list--state">
        <div className="job-list__pulse" />
        <p>Carregando…</p>
      </div>
    )
  }

  if (!loading && !searching && jobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list job-list--state">
        <h2>{emptyTitle}</h2>
        <p>{emptyHint}</p>
      </div>
    )
  }

  const countLabel = showTopFilters
    ? visibleJobs.length !== jobs.length
      ? `${visibleJobs.length} de ${jobs.length}`
      : jobs.length !== totalCount && totalCount > 0
        ? `${jobs.length} de ${totalCount}`
        : `${visibleJobs.length} vaga${visibleJobs.length === 1 ? '' : 's'}`
    : `${visibleJobs.length} vaga${visibleJobs.length === 1 ? '' : 's'}`

  const hiddenByParentFilters =
    showTopFilters && jobs.length === 0 && totalCount > 0

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
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder="Filtrar título ou descrição…"
                autoComplete="off"
                aria-label="Filtrar por título ou descrição"
              />
            </label>
            {showLanguageFilter && onLanguageChange ? (
              <label className="job-list__language">
                <span>Idioma</span>
                <select
                  value={filters.language}
                  onChange={(e) =>
                    onLanguageChange(e.target.value as DescriptionLanguage)
                  }
                  aria-label="Filtrar por idioma"
                >
                  <option value="">Qualquer</option>
                  <option value="pt">Português</option>
                  <option value="en">Inglês</option>
                </select>
              </label>
            ) : null}
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
                  ? 'Ajuste o texto ou limpe a busca acima.'
                  : jobs.length === 0 && totalCount > 0
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
