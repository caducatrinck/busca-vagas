export type LinkedInSessionStatus = {
  ok: boolean
  /** missing | incomplete | expired | network | unknown | ok */
  code: 'ok' | 'missing' | 'incomplete' | 'expired' | 'network' | 'unknown'
  message: string
  checkedAt: string | null
  httpStatus: number | null
}

let status: LinkedInSessionStatus = {
  ok: false,
  code: 'missing',
  message: 'Sessão LinkedIn ainda não verificada.',
  checkedAt: null,
  httpStatus: null,
}

export function getLinkedInSessionStatus(): LinkedInSessionStatus {
  return { ...status }
}

export function setLinkedInSessionStatus(
  next: LinkedInSessionStatus,
): LinkedInSessionStatus {
  status = { ...next }
  return getLinkedInSessionStatus()
}

export function markLinkedInSessionOk(): void {
  status = {
    ok: true,
    code: 'ok',
    message: 'Sessão LinkedIn ok.',
    checkedAt: new Date().toISOString(),
    httpStatus: null,
  }
}

export function markLinkedInSessionAuthFailure(
  httpStatus: number | null,
  detail?: string,
): void {
  status = {
    ok: false,
    code: 'expired',
    message:
      detail?.trim() ||
      'Sessão LinkedIn expirada ou inválida. Atualize o cookie li_at (e JSESSIONID) em Configurações.',
    checkedAt: new Date().toISOString(),
    httpStatus,
  }
}
