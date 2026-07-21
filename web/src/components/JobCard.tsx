import type { AppTag, Job, JobFilters, JobStatus } from '../lib/types'
import { jobStatus } from '../lib/jobStatus'
import { matchedWords, titleSearchText } from '../lib/filterJobs'
import { formatPostedAt } from '../lib/formatPostedAt'
import { useI18n } from '../i18n'
import { matchingCatalogTags } from '../shared/tags'
import { Button } from '../ui'
import './JobCard.css'

type Props = {
  job: Job
  filters: JobFilters
  catalogTags?: AppTag[]
  showDescriptionFilters?: boolean
  onStatusChange?: (job: Job, status: JobStatus) => void
}

export function JobCard({
  job,
  filters,
  catalogTags = [],
  showDescriptionFilters = true,
  onStatusChange,
}: Props) {
  const { t, locale } = useI18n()
  const status = jobStatus(job)
  const titleHaystack = titleSearchText(job)
  const titleHits = [
    ...matchedWords(titleHaystack, filters.includeTitle),
    ...matchedWords(titleHaystack, filters.excludeTitle),
  ]
  const descHits = showDescriptionFilters
    ? [
        ...matchedWords(job.description, filters.includeDescription),
        ...matchedWords(job.description, filters.excludeDescription),
      ]
    : []
  const badges = [...new Set([...titleHits, ...descHits])]

  const excerpt = job.description?.trim() || t('card.noDescription')

  const postedLabel = formatPostedAt(job.postedAt, Date.now(), locale)
  const postedTitle = job.postedLabel
    ? t('card.linkedinPosted', { label: job.postedLabel })
    : job.postedAt

  const metaTags = matchingCatalogTags(job, catalogTags).map((tag) => tag.label)
  const TAG_PREVIEW = 16
  const visibleTags = metaTags.slice(0, TAG_PREVIEW)
  const hiddenTagCount = metaTags.length - visibleTags.length

  return (
    <article
      className={`job-card${job.isNew ? ' job-card--new' : ''}${
        status === 'applied' ? ' job-card--applied' : ''
      }${status === 'discarded' ? ' job-card--discarded' : ''}`}
    >
      <div className="job-card__top">
        <h2>{job.title}</h2>
        <div className="job-card__meta">
          {job.isNew ? (
            <span className="job-card__new">{t('card.new')}</span>
          ) : null}
          {job.isNew === false ? (
            <span className="job-card__seen" title={t('card.seenBefore')}>
              {t('card.seen')}
            </span>
          ) : null}
          {status === 'discarded' ? (
            <span className="job-card__discarded-badge">
              {t('card.discardedBadge')}
            </span>
          ) : null}
          {postedLabel ? (
            <time dateTime={job.postedAt} title={postedTitle ?? undefined}>
              {postedLabel}
            </time>
          ) : null}
        </div>
      </div>
      <p className="job-card__company">{job.company || t('card.noCompany')}</p>
      <p className="job-card__location">
        {job.location || t('card.noLocation')}
      </p>
      {metaTags.length > 0 ? (
        <ul className="job-card__tags" title={metaTags.join(', ')}>
          {visibleTags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
          {hiddenTagCount > 0 ? (
            <li className="job-card__tags-more">+{hiddenTagCount}</li>
          ) : null}
        </ul>
      ) : null}
      <p className="job-card__excerpt">{excerpt}</p>
      {badges.length > 0 ? (
        <ul className="job-card__badges">
          {badges.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      <div className="job-card__actions">
        <div className="job-card__toggles">
          <label className="job-card__check">
            <input
              type="checkbox"
              checked={status === 'applied'}
              onChange={(e) =>
                onStatusChange?.(job, e.target.checked ? 'applied' : 'viewed')
              }
            />
            <span>{t('card.apply')}</span>
          </label>
          {status === 'discarded' ? (
            <Button
              size="sm"
              variant="soft"
              className="job-card__action-btn"
              onClick={() => onStatusChange?.(job, 'viewed')}
            >
              {t('card.restore')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              className="job-card__action-btn job-card__action-btn--discard"
              onClick={() => onStatusChange?.(job, 'discarded')}
            >
              {t('card.discard')}
            </Button>
          )}
        </div>
        <a
          className="job-card__link"
          href={job.url}
          target="_blank"
          rel="noreferrer"
        >
          {t('card.open')}
        </a>
      </div>
    </article>
  )
}
