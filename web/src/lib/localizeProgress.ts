import type { MessageKey } from '../i18n/messages'
import type { SearchProgress } from './types'
import { localizeVisibleError } from './localizeVisibleError'

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string

const EMPTY_REASON_KEYS: Record<string, MessageKey> = {
  all_discarded: 'empty.allDiscarded',
  linkedin_empty: 'empty.linkedinEmpty',
  linkedin_no_cards: 'empty.linkedinNoCards',
  no_new_jobs: 'empty.noNew',
  'Todas as vagas encontradas já estavam descartadas — limpe descartadas ou aguarde novas publicações.':
    'empty.allDiscarded',
  'LinkedIn respondeu vazio para essa janela de tempo (sem vagas recentes). Tente pausar o pooling e buscar com “Publicadas em” mais amplo (ex.: semana).':
    'empty.linkedinEmpty',
  'LinkedIn respondeu, mas a listagem veio sem cards para essa janela.':
    'empty.linkedinNoCards',
  'Nenhuma vaga nova nesta rodada': 'empty.noNew',
}

export function localizeEmptyReason(
  reason: string | null | undefined,
  t: TFn,
): string | null {
  const raw = reason?.trim()
  if (!raw) return null
  const key = EMPTY_REASON_KEYS[raw]
  if (key) return t(key)
  if (raw.startsWith('err:')) return localizeVisibleError(raw, t)
  const mapped = localizeVisibleError(raw, t)
  return mapped === t('err.generic') ? null : mapped
}

export function localizeProgressMessage(
  progress: SearchProgress,
  t: TFn,
): string | null {
  const raw = progress.message?.trim()
  if (!raw) return null
  if (
    progress.phase === 'listing' ||
    progress.phase === 'descriptions' ||
    progress.phase === 'saving'
  ) {
    return null
  }
  if (progress.phase === 'done') {
    const asEmpty = localizeEmptyReason(raw, t)
    if (asEmpty) return asEmpty
    const nova = /^(\d+)\s+nova/i.exec(raw)
    if (nova) return t('progress.newCount', { n: nova[1] })
    const newEn = /^(\d+)\s+new/i.exec(raw)
    if (newEn) return t('progress.newCount', { n: newEn[1] })
    return localizeVisibleError(raw, t)
  }
  if (progress.phase === 'error') {
    return localizeVisibleError(raw, t)
  }
  if (/parcial|partial|cancelled_partial/i.test(raw) || raw === 'err:cancelled_partial')
    return t('progress.cancelledPartial')
  if (/cancel|cancelled_empty/i.test(raw) || raw === 'err:cancelled_empty')
    return t('progress.cancelledEmpty')
  return localizeVisibleError(raw, t)
}

/** Título do card de progresso — UI é dona da apresentação (API manda fase/contagens). */
export function localizeProgressTitle(progress: SearchProgress, t: TFn): string {
  const { phase, listing, descriptions } = progress

  if (phase === 'listing') {
    if (listing.total != null) {
      return t('progress.listingLabel', {
        current: listing.current,
        total: listing.total,
      })
    }
    return t('progress.listingLabelOpen', { current: listing.current })
  }

  if (phase === 'descriptions') {
    if (descriptions.total <= 0) return t('progress.descNone')
    return t('progress.descLabel', {
      current: descriptions.current,
      total: descriptions.total,
    })
  }

  if (phase === 'saving') return t('progress.saving')
  if (phase === 'done') return t('progress.done')

  if (phase === 'error') {
    const label = progress.label.toLowerCase()
    if (/configura|configuration/i.test(label)) return t('progress.needConfig')
    if (/limite|limit|rate/i.test(label)) return t('progress.rateLimited')
    if (/pausa|pause|linkedin/i.test(label)) return t('progress.linkedinPause')
    if (/cancel/i.test(label)) return t('progress.cancelled')
    return t('progress.error')
  }

  if (/iniciando|starting/i.test(progress.label)) return t('progress.starting')
  return t('progress.starting')
}
