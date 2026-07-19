import { useCallback, useEffect, useState } from 'react'
import {
  checkLinkedInSession,
  fetchLinkedInSession,
  type LinkedInSessionStatus,
} from '../lib/api'

const POLL_MS = 60_000

type RefreshOptions = {
  /** Reprobe Voyager (POST). Sem force = só lê status em cache (GET). */
  force?: boolean
  /** Zera circuit breaker — só no “Verificar de novo” / após salvar cookies. */
  clearGuards?: boolean
}

export function useLinkedInSession(enabled: boolean) {
  const [session, setSession] = useState<LinkedInSessionStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (options: RefreshOptions = {}) => {
    if (!enabled) {
      setSession(null)
      return null
    }
    const { force = false, clearGuards = false } = options
    setChecking(true)
    try {
      const next = force
        ? await checkLinkedInSession({ clearGuards })
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
    // Mount: probe sem limpar guards (respeita cooldown do Voyager).
    void refresh({ force: true, clearGuards: false })
    const id = window.setInterval(() => {
      void refresh({ force: false })
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
