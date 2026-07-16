

export function formatPostedAt(
  postedAt: string | undefined | null,
  now = Date.now(),
): string | null {
  if (!postedAt?.trim()) return null

  const raw = postedAt.trim()
  const then = parsePostedAt(raw, now)
  if (then == null) {
    if (/atrás|atras|há\s/i.test(raw)) return normalizePtRelative(raw)
    return raw
  }

  return formatRelativeDiff(now - then)
}

function parsePostedAt(raw: string, now: number): number | null {
  const iso = Date.parse(raw)
  if (!Number.isNaN(iso)) return iso

  const lower = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (
    /^(just now|agora|right now|moments? ago|ha poucos (segundos|instantes))$/.test(
      lower,
    )
  ) {
    return now
  }

  if (lower === 'ontem' || lower === 'yesterday') {
    return now - 24 * 60 * 60 * 1000
  }

  const en = lower.match(
    /^(\d+)\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/,
  )
  if (en) return now - amountToMs(Number(en[1]), en[2])

  const ptHa = lower.match(
    /^ha\s+(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)$/,
  )
  if (ptHa) return now - amountToMs(Number(ptHa[1]), ptHa[2])

  const ptAtras = lower.match(
    /^(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)\s+atras$/,
  )
  if (ptAtras) return now - amountToMs(Number(ptAtras[1]), ptAtras[2])

  return null
}

function amountToMs(n: number, unitRaw: string): number {
  const unit = unitRaw.toLowerCase()
  if (unit.startsWith('min')) return n * 60_000
  if (unit.startsWith('hour') || unit.startsWith('hora')) return n * 3_600_000
  if (unit.startsWith('day') || unit.startsWith('dia')) return n * 86_400_000
  if (unit.startsWith('week') || unit.startsWith('semana')) return n * 604_800_000
  if (unit.startsWith('month') || unit.startsWith('mes')) return n * 2_592_000_000
  if (unit.startsWith('year') || unit.startsWith('ano')) return n * 31_536_000_000
  return n * 60_000
}

function formatRelativeDiff(diffMs: number): string {
  const mins = Math.floor(Math.max(0, diffMs) / 60_000)

  if (mins < 1) return 'agora'
  if (mins < 10) return 'menos de 10 minutos'
  if (mins < 20) return 'menos de 20 minutos'
  if (mins < 40) return 'menos de 40 minutos'
  if (mins < 60) return 'menos de uma hora'

  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return hours === 1 ? '1 hora atrás' : `${hours} horas atrás`
  }

  const days = Math.floor(hours / 24)
  if (days < 7) {
    return days === 1 ? '1 dia atrás' : `${days} dias atrás`
  }

  const weeks = Math.floor(days / 7)
  if (weeks < 5) {
    return weeks === 1 ? '1 semana atrás' : `${weeks} semanas atrás`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return months <= 1 ? '1 mês atrás' : `${months} meses atrás`
  }

  const years = Math.floor(days / 365)
  return years <= 1 ? '1 ano atrás' : `${years} anos atrás`
}

function normalizePtRelative(raw: string): string {
  return raw
    .replace(/\batras\b/gi, 'atrás')
    .replace(/\bHa\b/g, 'Há')
    .replace(/\bha\b/g, 'há')
}
