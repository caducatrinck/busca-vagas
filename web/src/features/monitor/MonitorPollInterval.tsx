import { NumberInput } from '../../ui'
import { clampIntervalMinutes } from './constants'

type Props = {
  value: number
  busy: boolean
  lastError: string | null
  onCommit: (minutes: number) => void
  hideError?: boolean
}

export function MonitorPollInterval({
  value,
  busy,
  lastError,
  onCommit,
  hideError,
}: Props) {
  return (
    <div className="search-panel__form monitor-poll">
      <div className="monitor-poll__row">
        <label className="monitor-poll__minutes">
          <span>Intervalo</span>
          <NumberInput
            min={1}
            max={120}
            value={value}
            emptyValue={20}
            disabled={busy}
            onValueChange={(n) => onCommit(clampIntervalMinutes(n))}
            aria-label="Intervalo do pooling em minutos"
          />
          <span>min</span>
        </label>
      </div>
      {lastError && !hideError ? (
        <p className="monitor-error">{lastError}</p>
      ) : null}
    </div>
  )
}
