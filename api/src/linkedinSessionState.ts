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
  message: 'err:session_unchecked',
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
    message: 'err:session_ok',
    checkedAt: new Date().toISOString(),
    httpStatus: null,
  }
}
