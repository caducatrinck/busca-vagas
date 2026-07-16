import { useEffect, useState } from 'react'
import {
  formatDuration,
  formatEta,
  type SearchProgress,
} from '../lib/types'
import './SearchProgressCard.css'

type Props = {
  progress: SearchProgress
  fetchDescriptions: boolean
  onCancel?: () => void
}

function phasePercent(current: number, total: number | null): number {
  if (total == null || total <= 0) {
    if (current <= 0) return 0
    return Math.min(92, Math.round((1 - Math.exp(-current / 70)) * 100))
  }
  return Math.min(100, Math.round((current / total) * 100))
}

function formatCount(current: number, total: number | null): string {
  if (total == null) return `${current}`
  return `${current}/${total}`
}

export function SearchProgressCard({
  progress,
  fetchDescriptions,
  onCancel,
}: Props) {
  const [now, setNow] = useState(() => Date.now())
  const running =
    progress.phase !== 'done' &&
    progress.phase !== 'error' &&
    progress.phase !== 'saving'

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const elapsedMs = Math.max(progress.elapsedMs, now - progress.startedAt)
  const listingPct = phasePercent(
    progress.listing.current,
    progress.listing.total,
  )
  const descTotal = progress.descriptions.total
  const descPct =
    descTotal > 0
      ? phasePercent(progress.descriptions.current, descTotal)
      : progress.phase === 'descriptions' ||
          progress.phase === 'saving' ||
          progress.phase === 'done'
        ? 100
        : 0

  const listingActive = progress.phase === 'listing'
  const descActive = progress.phase === 'descriptions'
  const listingDone =
    progress.phase === 'descriptions' ||
    progress.phase === 'saving' ||
    progress.phase === 'done'
  const descDone = progress.phase === 'saving' || progress.phase === 'done'
  const eta = formatEta(progress.etaSeconds)
  const canCancel = Boolean(onCancel) && running

  return (
    <div className="search-progress" role="status" aria-live="polite">
      <div className="search-progress__head">
        <div className="search-progress__title-row">
          <span className="search-progress__orb" aria-hidden />
          <div>
            <p className="search-progress__eyebrow">Busca em andamento</p>
            <h3 className="search-progress__title">{progress.label}</h3>
          </div>
        </div>
        <div
          className="search-progress__overall"
          aria-label={`${progress.overallPercent} por cento do processo`}
        >
          <span className="search-progress__overall-value">
            {progress.overallPercent}
          </span>
          <span className="search-progress__overall-unit">%</span>
        </div>
      </div>

      <div className="search-progress__meta">
        <span>Decorrido {formatDuration(elapsedMs)}</span>
        {eta ? <span>Restante {eta}</span> : null}
      </div>

      <div className="search-progress__track search-progress__track--overall">
        <div
          className="search-progress__fill search-progress__fill--overall"
          style={{ width: `${progress.overallPercent}%` }}
        />
      </div>

      <ol className="search-progress__phases">
        <li
          className={[
            'search-progress__phase',
            listingActive ? 'search-progress__phase--active' : '',
            listingDone ? 'search-progress__phase--done' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="search-progress__phase-meta">
            <span className="search-progress__phase-name">Vagas</span>
            <span className="search-progress__phase-count">
              {formatCount(progress.listing.current, progress.listing.total)}
              {progress.listing.total == null && progress.listing.current > 0
                ? '+'
                : ''}
            </span>
          </div>
          <div className="search-progress__track">
            <div
              className="search-progress__fill"
              style={{ width: `${listingPct}%` }}
            />
          </div>
          <p className="search-progress__phase-hint">
            {listingActive
              ? 'Coletando listagem no LinkedIn…'
              : listingDone
                ? 'Listagem concluída'
                : 'Aguardando'}
          </p>
        </li>

        {fetchDescriptions ? (
          <li
            className={[
              'search-progress__phase',
              descActive ? 'search-progress__phase--active' : '',
              descDone ? 'search-progress__phase--done' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="search-progress__phase-meta">
              <span className="search-progress__phase-name">Descrições</span>
              <span className="search-progress__phase-count">
                {descTotal > 0
                  ? formatCount(progress.descriptions.current, descTotal)
                  : listingActive
                    ? 'depois'
                    : listingDone
                      ? 'cache'
                      : '—'}
              </span>
            </div>
            <div className="search-progress__track">
              <div
                className="search-progress__fill search-progress__fill--desc"
                style={{ width: `${descPct}%` }}
              />
            </div>
            <p className="search-progress__phase-hint">
              {listingActive
                ? 'Só começa depois de listar todas as vagas'
                : descActive
                  ? 'Abrindo cada vaga para ler a descrição…'
                  : descDone
                    ? 'Descrições prontas'
                    : 'Aguardando'}
            </p>
          </li>
        ) : null}
      </ol>

      <div className="search-progress__footer">
        {progress.message ? (
          <p className="search-progress__message">{progress.message}</p>
        ) : (
          <span />
        )}
        {canCancel ? (
          <button
            type="button"
            className="search-progress__cancel"
            onClick={onCancel}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  )
}
