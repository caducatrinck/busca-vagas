import { poolingWindowMinutes } from '../../../../shared/poolingWindow'
import type { Monitor, SearchForm } from '../../lib/types'
import { Alert, Button, Field, Select, TextInput } from '../../ui'
import { POSTED_WITHIN_OPTIONS } from './constants'

type Props = {
  draft: SearchForm
  active: Monitor
  now: number
  searching: boolean
  searchBlocked: boolean
  rateLimitMsg: string | null
  onDraftChange: (next: SearchForm) => void
  onPausePooling: () => void
  onRunNow: () => void
}

export function MonitorSearchForm({
  draft,
  active,
  now,
  searching,
  searchBlocked,
  rateLimitMsg,
  onDraftChange,
  onPausePooling,
  onRunNow,
}: Props) {
  const pooling = active.pollingEnabled
  const pauseMode = pooling && !searching

  return (
    <div className="search-panel__form">
      <Field label="Palavras de busca">
        <TextInput
          value={draft.query}
          onChange={(e) => onDraftChange({ ...draft, query: e.target.value })}
          placeholder="Ex: React TypeScript"
        />
      </Field>

      <Field label="Localização (opcional)">
        <TextInput
          value={draft.location}
          onChange={(e) =>
            onDraftChange({ ...draft, location: e.target.value })
          }
          placeholder="Ex: Remoto, São Paulo"
        />
      </Field>

      <Field label="Publicadas em">
        {pooling ? (
          <TextInput
            disabled
            value={`Últimos ${poolingWindowMinutes(active.intervalMinutes, active.lastRunAt, now)} min`}
            aria-label="Publicadas em (definido pelo pooling)"
          />
        ) : (
          <Select
            fullWidth
            value={draft.postedWithin}
            options={POSTED_WITHIN_OPTIONS}
            aria-label="Publicadas em"
            onChange={(postedWithin) =>
              onDraftChange({ ...draft, postedWithin })
            }
          />
        )}
      </Field>

      <Button
        fullWidth
        variant={pauseMode ? 'danger' : 'primary'}
        disabled={
          searching || (!pooling && (!draft.query.trim() || searchBlocked))
        }
        title={
          searching
            ? 'Busca em andamento'
            : pooling
              ? 'Pausa o pooling automático'
              : rateLimitMsg
                ? rateLimitMsg
                : 'Busca agora e ativa o pooling automático'
        }
        onClick={() => {
          if (pauseMode) onPausePooling()
          else onRunNow()
        }}
      >
        {searching ? 'Buscando…' : pooling ? 'Pausar' : 'Buscar agora'}
      </Button>

      {rateLimitMsg && !pooling ? (
        <Alert tone="danger" className="monitor-rate-limit">
          {rateLimitMsg}
        </Alert>
      ) : null}
    </div>
  )
}
