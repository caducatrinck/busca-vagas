import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type AppTag,
  type DescriptionLanguage,
  type Job,
  type JobFilters,
  type JobStatus,
  type SearchProgress,
} from '../lib/types'
import { matchesTextFilter } from '../lib/filterJobs'
import { jobRecencyMs } from '../lib/formatPostedAt'
import { jobStatus } from '../lib/jobStatus'
import { isRateLimitError } from '../lib/rateLimit'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import { useI18n } from '../i18n'
import { JobCard } from './JobCard'
import { LanguageDropdown } from './LanguageDropdown'
import { SearchProgressCard } from './SearchProgressCard'
import { TagMultiSelect } from './TagMultiSelect'
import { Button, TextInput } from '../ui'
import './JobList.css'

type Props = {
  jobs: Job[]
  totalCount: number
  filters: JobFilters
  catalogTags?: AppTag[]
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
  onTagsChange?: (ids: string[]) => void
  onExcludedTagsChange?: (ids: string[]) => void
  onCreateTag?: (label: string) => Promise<AppTag>
  onDeleteTag?: (id: string) => Promise<void>
}

const EMPTY_JOBS: Job[] = []
const RENDER_PAGE = 48

export function JobList({
  jobs,
  totalCount,
  filters,
  catalogTags = [],
  loading,
  error,
  emptyTitle,
  emptyHint,
  showDescriptionFilters = true,
  showTopFilters = false,
  showLanguageFilter = false,
  title,
  searchProgress = null,
  fetchDescriptions = true,
  onCancelSearch,
  onStatusChange,
  onDiscardAll,
  onLanguageChange,
  onTagsChange,
  onExcludedTagsChange,
  onCreateTag,
  onDeleteTag,
}: Props) {
  const { t } = useI18n()
  const resolvedEmptyTitle = emptyTitle ?? t('list.emptyDefault')
  const resolvedEmptyHint = emptyHint ?? t('list.emptyHintDefault')
  const resolvedTitle = title ?? t('list.titleDefault')
  const searching = Boolean(searchProgress)
  const [textQuery, setTextQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [discarding, setDiscarding] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [renderLimit, setRenderLimit] = useState(RENDER_PAGE)
  const scrollRef = useRef<HTMLDivElement>(null)

  const safeJobs = jobs ?? EMPTY_JOBS

  const visibleJobs = useMemo(() => {
    const filtered = showTopFilters
      ? safeJobs.filter((job) => matchesTextFilter(job, textQuery))
      : safeJobs

    if (!showTopFilters) return filtered

    const now = Date.now()
    const dir = newestFirst ? -1 : 1
    return [...filtered].sort(
      (a, b) => dir * (jobRecencyMs(a, now) - jobRecencyMs(b, now)),
    )
  }, [safeJobs, textQuery, showTopFilters, newestFirst])

  useEffect(() => {
    setRenderLimit(RENDER_PAGE)
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [safeJobs, textQuery, newestFirst])

  const renderedJobs = useMemo(
    () => visibleJobs.slice(0, renderLimit),
    [visibleJobs, renderLimit],
  )
  const hasMoreJobs = renderLimit < visibleJobs.length

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasMoreJobs) return
    function onScroll() {
      if (!el) return
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 480
      if (nearBottom) {
        setRenderLimit((n) => Math.min(n + RENDER_PAGE, visibleJobs.length))
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [hasMoreJobs, visibleJobs.length])

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

  if (error && !loading && !searching && safeJobs.length === 0 && totalCount === 0) {
    const errorTitle = isRateLimitError(error)
      ? t('list.blocked')
      : t('list.loadFailed')
    return (
      <div className="job-list job-list--state job-list--error">
        <h2>{errorTitle}</h2>
        <p>{localizeVisibleError(error, t)}</p>
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
        <p>{t('list.loading')}</p>
      </div>
    )
  }

  if (!loading && !searching && safeJobs.length === 0 && totalCount === 0) {
    return (
      <div className="job-list job-list--state">
        <h2>{resolvedEmptyTitle}</h2>
        <p>{resolvedEmptyHint}</p>
      </div>
    )
  }

  const countLabel = showTopFilters
    ? visibleJobs.length !== safeJobs.length
      ? t('list.of', { a: visibleJobs.length, b: safeJobs.length })
      : safeJobs.length !== totalCount && totalCount > 0
        ? t('list.of', { a: safeJobs.length, b: totalCount })
        : visibleJobs.length === 1
          ? t('list.jobs', { n: visibleJobs.length })
          : t('list.jobs_plural', { n: visibleJobs.length })
    : visibleJobs.length === 1
      ? t('list.jobs', { n: visibleJobs.length })
      : t('list.jobs_plural', { n: visibleJobs.length })

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

      {error && !searching ? (
        <p className="job-list__inline-error" role="alert">
          {localizeVisibleError(error, t)}
        </p>
      ) : null}

      <div className="job-list__scroll" ref={scrollRef}>
      <header className="job-list__header">
        <div className="job-list__heading">
          <h2>{resolvedTitle}</h2>
          <p className="job-list__count">{countLabel}</p>
        </div>
        {showTopFilters ? (
          <div className="job-list__filters">
            <div className="job-list__toolbar">
              <label className="job-list__search">
                <TextInput
                  type="search"
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  placeholder={t('list.filterText')}
                  autoComplete="off"
                  aria-label={t('list.filterTextAria')}
                />
              </label>
              <div className="job-list__toolbar-end">
                {showLanguageFilter && onLanguageChange ? (
                  <LanguageDropdown
                    fullWidth
                    placeholder={t('list.language')}
                    value={filters.language}
                    onChange={onLanguageChange}
                  />
                ) : null}
                {onDiscardAll ? (
                  <Button
                    variant="danger"
                    size="sm"
                    className="job-list__discard-all"
                    disabled={discardCount === 0 || discarding || searching}
                    onClick={() => setConfirmDiscard(true)}
                  >
                    {discarding
                      ? t('list.discarding')
                      : discardCount > 0
                        ? t('list.discardCount', { n: discardCount })
                        : t('list.discard')}
                  </Button>
                ) : null}
              </div>
            </div>

            {onTagsChange && onExcludedTagsChange && onCreateTag ? (
              <div className="job-list__tags-row">
                <TagMultiSelect
                  compact
                  tone="include"
                  catalog={catalogTags}
                  selectedIds={filters.selectedTagIds ?? []}
                  onChange={onTagsChange}
                  onCreateTag={onCreateTag}
                  onDeleteTag={onDeleteTag}
                  placeholder={t('tags.searchIncludePlaceholder')}
                />
                <div className="job-list__tags-end">
                  <TagMultiSelect
                    compact
                    tone="exclude"
                    catalog={catalogTags}
                    selectedIds={filters.excludedTagIds ?? []}
                    onChange={onExcludedTagsChange}
                    onCreateTag={onCreateTag}
                    onDeleteTag={onDeleteTag}
                    placeholder={t('tags.searchExcludePlaceholder')}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="job-list__sort"
                    onClick={() => setNewestFirst((v) => !v)}
                    aria-label={
                      newestFirst
                        ? t('list.sortNewestAria')
                        : t('list.sortOldestAria')
                    }
                    title={
                      newestFirst
                        ? t('list.sortNewestTitle')
                        : t('list.sortOldestTitle')
                    }
                  >
                    <svg
                      className="job-list__sort-cal"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                    <span className="job-list__sort-label">
                      {t('list.sortDate')}
                    </span>
                    <span className="job-list__sort-dir" aria-hidden>
                      {newestFirst ? '↓' : '↑'}
                    </span>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

        {visibleJobs.length === 0 ? (
          <div className="job-list__empty job-list--state job-list--state-inline">
            <h2>
              {hiddenByParentFilters
                ? resolvedEmptyTitle
                : showTopFilters
                  ? t('list.noFilter')
                  : resolvedEmptyTitle}
            </h2>
            <p>
              {hiddenByParentFilters
                ? t('list.hiddenByFilters', { n: totalCount })
                : showTopFilters
                  ? t('list.adjustFilters')
                  : resolvedEmptyHint}
            </p>
          </div>
        ) : (
          <div className="job-list__grid">
            {renderedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                filters={filters}
                catalogTags={catalogTags}
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
            <h3 id="discard-all-title">{t('list.discardConfirmTitle')}</h3>
            <p>{t('list.discardConfirmBody', { n: discardCount })}</p>
            <div className="job-list__modal-actions">
              <Button
                variant="ghost"
                onClick={() => setConfirmDiscard(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={() => void confirmDiscardAll()}>
                {t('list.discardConfirmYes')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
