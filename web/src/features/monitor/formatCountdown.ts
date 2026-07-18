export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function tabCountdownLabel(
  nextRunAt: string | null,
  now: number,
  running: boolean,
): string | null {
  if (!nextRunAt && !running) return null
  if (running) return 'buscando'
  if (!nextRunAt) return null
  const remaining = new Date(nextRunAt).getTime() - now
  if (remaining <= 0) return 'agora'
  return `em ${formatCountdown(remaining)}`
}
