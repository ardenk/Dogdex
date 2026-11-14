import { useState } from 'react'
import type { FormEvent } from 'react'
import { useToast } from '../../components/toast-context'
import { useAuth } from '../../sync/auth-context'

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s} seconds ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : new Date(ms).toLocaleDateString()
}

export function AccountCard() {
  const auth = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!auth.enabled) {
    return (
      <section className="card stack" aria-labelledby="acct-heading">
        <h2 id="acct-heading">Account</h2>
        <p className="muted small">Cloud sync isn’t set up in this build, so Dogdex runs on this device only.</p>
      </section>
    )
  }

  if (auth.loading) {
    return (
      <section className="card stack" aria-labelledby="acct-heading">
        <h2 id="acct-heading">Account</h2>
        <p className="muted small" aria-live="polite">Checking your sign-in…</p>
      </section>
    )
  }

  // Arrived from a reset email: choose a new password.
  if (auth.recovering && auth.user) {
    const saveNewPassword = async (e: FormEvent) => {
      e.preventDefault()
      if (newPassword.length < 8) return setMessage('Use at least 8 characters.')
      if (newPassword !== confirmPassword) return setMessage('The two passwords don’t match.')
      setBusy(true)
      setMessage(null)
      try {
        const err = await auth.updatePassword(newPassword)
        if (err) setMessage(err)
        else {
          setNewPassword('')
          setConfirmPassword('')
          toast('Password updated')
        }
      } finally {
        setBusy(false)
      }
    }
    return (
      <section className="card stack" aria-labelledby="acct-heading">
        <h2 id="acct-heading">Choose a new password</h2>
        <p className="muted small">
          You’re signed in as <strong>{auth.user.email}</strong>. Pick a new password to finish resetting.
        </p>
        <form className="stack" onSubmit={saveNewPassword}>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Type it again</label>
            <input id="confirm-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {message && (
            <p role="alert" className="small">
              {message}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => auth.cancelRecovery()}>
            Not now
          </button>
        </form>
      </section>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'forgot') {
        const err = await auth.requestPasswordReset(email)
        if (err) setMessage(err)
        else {
          // Same wording whether or not the email has an account, so nobody can use this to find out who has one.
          setMessage('If there’s an account for that email, a reset link is on its way. Check your inbox and spam folder, then open the link on this device.')
          setMode('signin')
        }
      } else if (mode === 'signin') {
        const err = await auth.signIn(email, password)
        if (err) setMessage(err)
        else setPassword('')
      } else {
        const res = await auth.signUp(email, password)
        if (res.error) setMessage(res.error)
        else if (res.needsConfirmation) {
          setMessage('Almost there. Check your email for a confirmation link, then come back and sign in.')
          setMode('signin')
          setPassword('')
        } else setPassword('')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!auth.user) {
    return (
      <section className="card stack" aria-labelledby="acct-heading">
        <h2 id="acct-heading">{mode === 'forgot' ? 'Reset your password' : 'Back up and sync'}</h2>
        {mode === 'forgot' && <p className="muted small">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>}
        {auth.recovering && !auth.user && (
          <p role="alert" className="small">
            That reset link has expired or was already used. Request a new one below.
          </p>
        )}
        <p className={mode === 'forgot' ? 'sr-only' : 'muted small'}>
          Optional. Dogdex works fully without an account. Sign in to back up your collection and use it on more than one device. Your collection stays private to your account.
        </p>
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="acct-email">Email</label>
            <input id="acct-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="acct-password">Password</label>
            <input
              id="acct-password"
              className="input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="acct-pw-hint"
            />
            <span id="acct-pw-hint" className="muted small">{mode === 'signup' ? 'At least 8 characters.' : ' '}</span>
          </div>
          )}
          {message && (
            <p role="alert" className="small">
              {message}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
          </button>
          {mode === 'signin' && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => { setMode('forgot'); setMessage(null) }}>
              Forgot your password?
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setMode(mode === 'signup' || mode === 'forgot' ? 'signin' : 'signup')
              setMessage(null)
            }}
          >
            {mode === 'signin' ? 'New here? Create an account' : mode === 'signup' ? 'Have an account? Sign in' : 'Back to sign in'}
          </button>
        </form>
      </section>
    )
  }

  if (auth.needsAccountChoice) {
    return (
      <section className="card stack" aria-labelledby="acct-heading">
        <h2 id="acct-heading">Different account on this device</h2>
        <p className="small">
          This device holds a collection from another account. To keep the two collections from mixing, nothing has synced yet.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            if (!window.confirm(`Remove the other account's collection from this device and load ${auth.user?.email ?? 'your'} collection instead?`)) return
            await auth.replaceDeviceData()
            toast('Loaded your account')
          }}
        >
          Use {auth.user.email ?? 'this account'} on this device
        </button>
        <button type="button" className="btn" onClick={() => auth.signOut()}>
          Sign out
        </button>
      </section>
    )
  }

  const signOut = async () => {
    if (!window.confirm('Sign out? Your collection will be removed from this device. It stays safe in your account, and signing back in brings it back.')) return
    setBusy(true)
    try {
      const result = await auth.signOut()
      if (result === 'unsynced') {
        const force = window.confirm(
          "Your latest changes couldn't be backed up (you may be offline). Signing out now will lose them. Sign out anyway?",
        )
        if (force) await auth.signOut({ force: true })
      } else {
        toast('Signed out. Your collection was removed from this device.')
      }
    } finally {
      setBusy(false)
    }
  }

  const state =
    auth.status === 'syncing'
      ? 'Syncing…'
      : auth.status === 'error'
        ? 'Not synced'
        : auth.lastSyncedAt
          ? `Synced ${ago(auth.lastSyncedAt)}`
          : 'Ready to sync'

  return (
    <section className="card stack" aria-labelledby="acct-heading">
      <h2 id="acct-heading">Back up and sync</h2>
      <p>
        Signed in as <strong>{auth.user.email}</strong>
      </p>
      <p className="small" role="status" aria-live="polite">
        <strong>{state}</strong>
        {auth.status === 'error' && auth.error ? <span className="muted"> · {auth.error}</span> : null}
      </p>
      <div className="row">
        <button type="button" className="btn grow" onClick={() => auth.syncNow()} disabled={auth.status === 'syncing'}>
          Sync now
        </button>
        <button type="button" className="btn grow" onClick={signOut} disabled={busy || auth.status === 'syncing'}>
          Sign out
        </button>
      </div>
      <p className="muted small">Signing out removes your collection from this device (it stays in your account). Photos are stored in a private folder only your account can open.</p>
    </section>
  )
}
