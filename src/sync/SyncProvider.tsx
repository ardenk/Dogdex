import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { useData } from '../storage/data-context'
import { db } from '../storage/db'
import { claimDevice, flushAndClear, getMeta, resetDevice, syncOnce } from './engine'
import { AuthContext } from './auth-context'
import type { AuthValue } from './auth-context'
import { openedFromRecoveryLink, supabase } from './client'
import { deleteCloudData, supabaseStore } from './supabaseStore'

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

export function SyncProvider({ children }: { children: ReactNode }) {
  const { snapshot, settings } = useData()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [ready, setReady] = useState(false) // this device is assigned to the signed-in account
  const [needsAccountChoice, setNeedsAccountChoice] = useState(false)
  const [recovering, setRecovering] = useState(openedFromRecoveryLink)
  const [status, setStatus] = useState<AuthValue['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const running = useRef(false)
  const again = useRef(false)
  const signingOut = useRef(false)

  const userId = session?.user.id

  // Track the Supabase session.
  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Coming from a reset email: show the "choose a new password" screen.
  useEffect(() => {
    if (recovering) navigate('/you', { replace: true })
  }, [recovering, navigate])

  // Assign the device to the account, or ask first if it belonged to someone else.
  useEffect(() => {
    setReady(false)
    setNeedsAccountChoice(false)
    if (!userId) return
    let alive = true
    claimDevice(db, userId).then(async (result) => {
      if (!alive) return
      if (result === 'other') setNeedsAccountChoice(true)
      else setReady(true)
      const last = await getMeta(db, 'lastSyncedAt')
      if (alive && last) setLastSyncedAt(Number(last))
    })
    return () => {
      alive = false
    }
  }, [userId])

  const syncNow = useCallback(async () => {
    if (!supabase || !userId || !ready || signingOut.current) return
    if (running.current) {
      again.current = true // changes arrived mid-sync: go around once more
      return
    }
    running.current = true
    setStatus('syncing')
    try {
      do {
        again.current = false
        await syncOnce(db, supabaseStore(supabase, userId), userId)
      } while (again.current)
      setError(null)
      setLastSyncedAt(Date.now())
      setStatus('idle')
    } catch (e) {
      setError(navigator.onLine ? errorText(e) : 'Offline. Changes are saved on this device and will sync when you reconnect.')
      setStatus('error')
    } finally {
      running.current = false
    }
  }, [userId, ready])

  // Sync when ready, shortly after local changes, and when coming back online or into view.
  useEffect(() => {
    if (ready) void syncNow()
  }, [ready, syncNow])

  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => void syncNow(), 1500)
    return () => window.clearTimeout(t)
  }, [ready, syncNow, snapshot, settings])

  useEffect(() => {
    if (!ready) return
    const onVisible = () => document.visibilityState === 'visible' && void syncNow()
    const onOnline = () => void syncNow()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, syncNow])

  const value = useMemo<AuthValue>(
    () => ({
      enabled: supabase !== null,
      loading,
      user: session ? { id: session.user.id, email: session.user.email } : null,
      status,
      lastSyncedAt,
      error,
      needsAccountChoice,
      recovering,

      async requestPasswordReset(email) {
        if (!supabase) return 'Cloud sync is not configured'
        // The link must come back to this app, so use the address the user is on right now.
        const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/you` })
        return e ? e.message : null
      },

      async updatePassword(password) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error: e } = await supabase.auth.updateUser({ password })
        if (e) return e.message
        setRecovering(false)
        return null
      },

      cancelRecovery() {
        setRecovering(false)
      },

      async signIn(email, password) {
        if (!supabase) return 'Cloud sync is not configured'
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        return e ? e.message : null
      },

      async signUp(email, password) {
        if (!supabase) return { error: 'Cloud sync is not configured' }
        const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password })
        if (e) return { error: e.message }
        // No session back means the project requires email confirmation first.
        return { needsConfirmation: !data.session }
      },

      async signOut(opts) {
        if (!supabase) return 'done'
        // The device holds someone else's data (account choice pending): don't touch it, just end the session.
        if (!userId || !ready) {
          await supabase.auth.signOut()
          return 'done'
        }
        signingOut.current = true // stop background syncs from re-downloading what we're about to remove
        try {
          while (running.current) await new Promise((r) => setTimeout(r, 100))
          const result = await flushAndClear(db, supabaseStore(supabase, userId), userId, opts?.force)
          if (result === 'unsynced') return 'unsynced'
          setLastSyncedAt(null)
          setStatus('idle')
          setError(null)
          await supabase.auth.signOut()
          return 'done'
        } finally {
          signingOut.current = false
        }
      },

      syncNow,

      async replaceDeviceData() {
        if (!userId) return
        await resetDevice(db, userId)
        setNeedsAccountChoice(false)
        setReady(true)
      },

      async wipeAll() {
        if (supabase && userId) await deleteCloudData(supabase, userId)
        await resetDevice(db, userId) // clears local data and cursors, keeps the device assigned to this account
      },
    }),
    [loading, session, status, lastSyncedAt, error, needsAccountChoice, recovering, syncNow, userId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
