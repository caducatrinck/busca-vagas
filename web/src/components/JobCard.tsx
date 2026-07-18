import type { Job, JobFilters, JobStatus } from '../lib/types'
import { jobStatus } from '../lib/jobStatus'
import { matchedWords, titleSearchText } from '../lib/filterJobs'
import { formatPostedAt } from '../lib/formatPostedAt'
import { useI18n } from '../i18n'
import {
  parseContractTags,
  resolveWorkplaceType,
  type WorkplaceType,
} from '../shared/domain'
import { Button } from '../ui'
import './JobCard.css'

type Props = {
  job: Job
  filters: JobFilters
  showDescriptionFilters?: boolean
  onStatusChange?: (job: Job, status: JobStatus) => void
}

const WORKPLACE_KEYS: Record<WorkplaceType, 'workplace.hybrid' | 'workplace.onsite' | 'workplace.remote'> = {
  hybrid: 'workplace.hybrid',
  onsite: 'workplace.onsite',
  remote: 'workplace.remote',
}

export function JobCard({
  job,
  filters,
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

  const contractTags = job.contractTags?.length
    ? job.contractTags
    : parseContractTags(job.description ?? '')
  const workplace = resolveWorkplaceType(job.workplaceType, job.description)
  const metaTags = [
    ...(workplace ? [t(WORKPLACE_KEYS[workplace])] : []),
    ...contractTags,
  ]

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
        <ul className="job-card__tags">
          {metaTags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
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
