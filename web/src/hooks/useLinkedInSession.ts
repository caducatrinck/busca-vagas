import { useCallback, useEffect, useState } from 'react'
import {
  checkLinkedInSession,
  fetchLinkedInSession,
  type LinkedInSessionStatus,
} from '../lib/api'

const POLL_MS = 60_000

export function useLinkedInSession(enabled: boolean) {
  const [session, setSession] = useState<LinkedInSessionStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (force = false) => {
    if (!enabled) {
      setSession(null)
      return null
    }
    setChecking(true)
    try {
      const next = force
        ? await checkLinkedInSession()
        : await fetchLinkedInSession()
      setSession(next)
      return next
    } catch {
      return null
    } finally {
      setChecking(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setSession(null)
      return
    }
    void refresh(true)
    const id = window.setInterval(() => {
      void refresh(false)
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [enabled, refresh])

  const needsAttention =
    enabled &&
    session != null &&
    !session.ok &&
    (session.code === 'expired' ||
      session.code === 'incomplete' ||
      session.code === 'missing')

  return {
    session,
    checking,
    needsAttention,
    refresh,
  }
}
