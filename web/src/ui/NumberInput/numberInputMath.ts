/** helpers puros do NumberInput — fáceis de testar sem React */
export function clampNumber(n: number, min?: number, max?: number): number {
  let out = n
  if (min != null) out = Math.max(min, out)
  if (max != null) out = Math.min(max, out)
  return out
}

export function parseNumberInput(
  raw: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const trimmed = raw.trim()
  const parsed = trimmed === '' ? fallback : Number(trimmed)
  return clampNumber(
    Number.isFinite(parsed) ? parsed : fallback,
    min,
    max,
  )
}
