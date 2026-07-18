import type { MessageKey } from '../i18n/messages'

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string

/** Códigos estáveis (`err:…`) + legado PT/EN da API → texto via translate. */
export function localizeVisibleError(
  raw: string | null | undefined,
  t: TFn,
): string {
  const text = raw?.trim()
  if (!text) return t('err.generic')

  const coded = matchErrorCode(text, t)
  if (coded) return coded

  const legacy = matchLegacyError(text, t)
  if (legacy) return legacy

  return t('err.generic')
}

function matchErrorCode(text: string, t: TFn): string | null {
  if (text.startsWith('err:')) {
    const body = text.slice(4)
    const [code, ...rest] = body.split(':')
    const param = rest.join(':')

    switch (code) {
      case 'cancelled_partial':
        return t('progress.cancelledPartial')
      case 'cancelled_empty':
        return t('progress.cancelledEmpty')
      case 'session_expired':
        return t('err.sessionExpired')
      case 'session_rate_limited':
        return t('session.body.rateLimited')
      case 'session_unchecked':
        return t('session.body.unknown')
      case 'session_ok':
        return t('session.body.unknown')
      case 'missing_li_at':
        return t('err.missingLiAt')
      case 'monitor_not_found':
        return t('err.monitorNotFound')
      case 'monitor_search_required':
        return t('err.monitorSearchRequired')
      case 'query_required':
        return t('err.queryRequired')
      case 'invalid_status':
        return t('err.invalidStatus')
      case 'job_not_found':
        return t('err.jobNotFound')
      case 'clear_status_invalid':
        return t('err.clearStatusInvalid')
      case 'invalid_backup':
        return t('err.invalidBackup')
      case 'pooling_unexpected':
        return t('err.poolingUnexpected')
      case 'cooldown':
        return t('rate.waitCooldown', { n: Number(param) || 1 })
      case 'local_cap_hour':
        return t('rate.localHour', { n: Number(param) || 0 })
      case 'local_cap_day':
        return t('rate.localDay', { n: Number(param) || 0 })
      case 'linkedin_429':
        return t('rate.linkedin429', { n: Number(param) || 0 })
      case 'linkedin_999':
        return t('rate.linkedin999', { n: Number(param) || 0 })
      case 'linkedin_pause':
        return t('rate.linkedinPause', { n: Number(param) || 0 })
      case 'rate_exceeded':
        return t('rate.exceeded')
      case 'network_linkedin':
        return t('err.networkLinkedIn')
      case 'cookie_incomplete':
        return t('err.cookieIncomplete')
      case 'http':
        return t('err.http', { n: param || '?' })
      case 'invalid_response':
        return t('err.invalidResponse')
      case 'stream_empty':
        return t('err.streamEmpty')
      case 'search_no_result':
        return t('err.searchNoResult')
      case 'session_status':
        return t('err.sessionStatus')
      case 'session_check':
        return t('err.sessionCheck')
      case 'settings_load':
        return t('err.settingsLoad')
      case 'settings_save':
        return t('err.settingsSave')
      case 'update_no_asset':
        return t('update.noAsset')
      case 'update_http':
        return t('update.downloadHttp', { n: param || '?' })
      case 'update_github':
        return t('update.githubHttp', { n: param || '?' })
      case 'generic':
        return t('err.generic')
      default:
        return null
    }
  }
  return null
}

function matchLegacyError(text: string, t: TFn): string | null {
  const cooldown = text.match(/Aguarde\s+(\d+)s\s+entre buscas/i)
  if (cooldown) return t('rate.waitCooldown', { n: Number(cooldown[1]) })
  const waitEn = text.match(/Wait\s+(\d+)s\s+between searches/i)
  if (waitEn) return t('rate.waitCooldown', { n: Number(waitEn[1]) })

  const hour = text.match(
    /Limite de segurança local:\s*(\d+)\s*buscas\/hora/i,
  )
  if (hour) return t('rate.localHour', { n: Number(hour[1]) })
  const day = text.match(/Limite de segurança local:\s*(\d+)\s*buscas\/dia/i)
  if (day) return t('rate.localDay', { n: Number(day[1]) })

  const li429 = text.match(/HTTP 429.*?(?:~|Aguarde\s*|Pausando\s*~?)(\d+)/i)
  if (/HTTP 429|rate limit/i.test(text) && /LinkedIn/i.test(text)) {
    const n = li429?.[1] ? Number(li429[1]) : 0
    return t('rate.linkedin429', { n })
  }
  if (/HTTP 999|anti-bot/i.test(text) && /LinkedIn/i.test(text)) {
    const n = text.match(/~(\d+)/)?.[1]
    return t('rate.linkedin999', { n: n ? Number(n) : 0 })
  }
  if (/LinkedIn pediu pausa/i.test(text)) {
    const n = text.match(/~(\d+)/)?.[1]
    return t('rate.linkedinPause', { n: n ? Number(n) : 0 })
  }

  const map: Array<[RegExp, MessageKey]> = [
    [/Configure o cookie li_at/i, 'err.missingLiAt'],
    [/Monitor não encontrado/i, 'err.monitorNotFound'],
    [/Configure a busca do monitor/i, 'err.monitorSearchRequired'],
    [/Campo query é obrigatório|query é obrigatória/i, 'err.queryRequired'],
    [/status inválido/i, 'err.invalidStatus'],
    [/Vaga não encontrada/i, 'err.jobNotFound'],
    [/Só é possível limpar/i, 'err.clearStatusInvalid'],
    [/Arquivo inválido/i, 'err.invalidBackup'],
    [/Falha inesperada no pooling/i, 'err.poolingUnexpected'],
    [/Falha de rede ao contatar o LinkedIn/i, 'err.networkLinkedIn'],
    [/Cookie LinkedIn incompleto|Cookie incompleto/i, 'err.cookieIncomplete'],
    [/Resposta inválida/i, 'err.invalidResponse'],
    [/Resposta sem corpo|stream indisponível/i, 'err.streamEmpty'],
    [/Busca encerrada sem resultado/i, 'err.searchNoResult'],
    [/Falha ao ler status da sessão/i, 'err.sessionStatus'],
    [/Falha ao verificar sessão/i, 'err.sessionCheck'],
    [/Falha ao carregar configurações/i, 'err.settingsLoad'],
    [/Falha ao salvar configurações/i, 'err.settingsSave'],
    [/Rate limit excedido/i, 'rate.exceeded'],
    [/Nenhum asset para baixar/i, 'update.noAsset'],
    [/Aguarde entre buscas|Wait between searches/i, 'rate.waitCooldownShort'],
  ]

  for (const [re, key] of map) {
    if (re.test(text)) return t(key)
  }

  const http = text.match(/Erro HTTP\s+(\d+)/i) || text.match(/HTTP\s+(\d+)/i)
  if (http && /Erro HTTP/i.test(text)) {
    return t('err.http', { n: http[1] })
  }

  return null
}
