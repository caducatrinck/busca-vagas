
export function formatPostedAt(
  postedAt: string | undefined | null,
  now = Date.now(),
): string | null {
  if (!postedAt?.trim()) return null

  const raw = postedAt.trim()

  // LinkedIn costuma mandar só YYYY-MM-DD no datetime — não converter em "N horas".
  if (isDateOnly(raw)) {
    return formatDateOnlyLabel(raw, now)
  }

  const then = parsePostedAt(raw, now)
  if (then == null) {
    if (/atrás|atras|há\s/i.test(raw)) return normalizePtRelative(raw)
    return raw
  }

  return formatRelativeDiff(now - then)
}

/** Timestamp para ordenar vagas (postedAt → firstSeenAt → lastSeenAt). */
export function jobRecencyMs(
  job: {
    postedAt?: string | null
    firstSeenAt?: string | null
    lastSeenAt?: string | null
  },
  now = Date.now(),
): number {
  const posted = job.postedAt?.trim()
  if (posted) {
    const fromPosted = parsePostedAt(posted, now)
    if (fromPosted != null) return fromPosted
  }
  for (const iso of [job.firstSeenAt, job.lastSeenAt]) {
    if (!iso?.trim()) continue
    const ms = Date.parse(iso)
    if (!Number.isNaN(ms)) return ms
  }
  return 0
}

function isDateOnly(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
}

function ymdLocal(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localNoonMs(ymd: string): number {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function formatDateOnlyLabel(ymd: string, now: number): string {
  const today = ymdLocal(now)
  if (ymd === today) return 'hoje'
  if (ymd === ymdLocal(now - 86_400_000)) return 'ontem'

  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(localNoonMs(ymd))) / 86_400_000,
  )
  if (days < 0) return 'hoje'
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

export function parsePostedAt(raw: string, now: number): number | null {
  if (isDateOnly(raw)) {
    return localNoonMs(raw)
  }

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

  if (lower === 'ontem' || lower === 'yesterday' || /\bontem\b/.test(lower)) {
    return now - 24 * 60 * 60 * 1000
  }

  const en = lower.match(
    /(\d+)\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago/,
  )
  if (en) return now - amountToMs(Number(en[1]), en[2])

  // "há 8 horas", "Compartilhada há 4 horas", etc.
  const ptHa = lower.match(
    /\bha\s+(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)\b/,
  )
  if (ptHa) return now - amountToMs(Number(ptHa[1]), ptHa[2])

  const ptAtras = lower.match(
    /(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)\s+atras/,
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

  // Estilo LinkedIn PT: "há N minutos/horas/dias"
  if (mins < 1) return 'agora'
  if (mins < 60) {
    return mins === 1 ? 'há 1 minuto' : `há ${mins} minutos`
  }

  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    return hours === 1 ? 'há 1 hora' : `há ${hours} horas`
  }

  const days = Math.floor(hours / 24)
  if (days < 7) {
    return days === 1 ? 'há 1 dia' : `há ${days} dias`
  }

  const weeks = Math.floor(days / 7)
  if (weeks < 5) {
    return weeks === 1 ? 'há 1 semana' : `há ${weeks} semanas`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return months <= 1 ? 'há 1 mês' : `há ${months} meses`
  }

  const years = Math.floor(days / 365)
  return years <= 1 ? 'há 1 ano' : `há ${years} anos`
}

function normalizePtRelative(raw: string): string {
  return raw
    .replace(/\batras\b/gi, 'atrás')
    .replace(/\bHa\b/g, 'Há')
    .replace(/\bha\b/g, 'há')
}
