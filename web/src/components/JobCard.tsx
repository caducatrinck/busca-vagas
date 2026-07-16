import type { Job, JobFilters, JobStatus } from '../lib/types'
import { jobStatus } from '../lib/jobStatus'
import { matchedWords } from '../lib/filterJobs'
import { formatPostedAt } from '../lib/formatPostedAt'
import './JobCard.css'

type Props = {
  job: Job
  filters: JobFilters
  showDescriptionFilters?: boolean
  onStatusChange?: (job: Job, status: JobStatus) => void
}


export function JobCard({
  job,
  filters,
  showDescriptionFilters = true,
  onStatusChange,
}: Props) {
  const status = jobStatus(job)
  const titleHits = [
    ...matchedWords(job.title, filters.includeTitle),
    ...matchedWords(job.title, filters.excludeTitle),
  ]
  const descHits = showDescriptionFilters
    ? [
        ...matchedWords(job.description, filters.includeDescription),
        ...matchedWords(job.description, filters.excludeDescription),
      ]
    : []
  const badges = [...new Set([...titleHits, ...descHits])]

  const excerpt =
    job.description?.trim() || 'Descrição não disponível nesta busca.'

  const postedLabel = formatPostedAt(job.postedAt)
  const postedTitle = job.postedLabel
    ? `No LinkedIn: ${job.postedLabel}`
    : job.postedAt

  return (
    <article
      className={`job-card${job.isNew ? ' job-card--new' : ''}${
        status === 'applied' ? ' job-card--applied' : ''
      }${status === 'discarded' ? ' job-card--discarded' : ''}`}
    >
      <div className="job-card__top">
        <h2>{job.title}</h2>
        <div className="job-card__meta">
          {job.isNew ? <span className="job-card__new">Nova</span> : null}
          {job.isNew === false ? (
            <span className="job-card__seen" title="Já apareceu em buscas anteriores">
              Já vista
            </span>
          ) : null}
          {status === 'discarded' ? (
            <span className="job-card__discarded-badge">Descartada</span>
          ) : null}
          {postedLabel ? (
            <time dateTime={job.postedAt} title={postedTitle}>
              {postedLabel}
            </time>
          ) : null}
        </div>
      </div>
      <p className="job-card__company">{job.company || 'Empresa não informada'}</p>
      <p className="job-card__location">{job.location || 'Local não informado'}</p>
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
            <span>Já apliquei</span>
          </label>
          {status === 'discarded' ? (
            <button
              type="button"
              className="job-card__action-btn job-card__action-btn--restore"
              onClick={() => onStatusChange?.(job, 'viewed')}
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              className="job-card__action-btn job-card__action-btn--discard"
              onClick={() => onStatusChange?.(job, 'discarded')}
            >
              Descartar
            </button>
          )}
        </div>
        <a
          className="job-card__link"
          href={job.url}
          target="_blank"
          rel="noreferrer"
        >
          Abrir no LinkedIn
        </a>
      </div>
    </article>
  )
}
