import { useRef, useState } from 'react'
import { useToast } from '../../components/toast-context'
import { guessAccuracy } from '../../domain/guess'
import { exportBackup, importBackup } from '../../storage/backup'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'
import { useAuth } from '../../sync/auth-context'
import { AccountCard } from './AccountCard'

export function YouPage() {
  const { snapshot, settings } = useData()
  const toast = useToast()
  const auth = useAuth()
  const accuracy = guessAccuracy(snapshot.guesses)
  const importInput = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  const download = async () => {
    const blob = await exportBackup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dogdex-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!window.confirm('Importing replaces everything currently in this app. Continue?')) return
    try {
      const n = await importBackup(file)
      toast(`Imported ${n} dogs`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That file could not be imported.')
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const keepData = async () => {
    const ok = (await navigator.storage?.persist?.()) ?? false
    setPersisted(ok)
    toast(ok ? 'Your browser will keep your data.' : 'Your browser did not guarantee storage. Export a backup to be safe.')
  }

  const wipe = async () => {
    const signedIn = !!auth.user
    const ok = window.confirm(
      signedIn
        ? 'Delete every dog, photo, and badge from this device AND from your cloud backup? This cannot be undone.'
        : 'Delete every dog, photo, and badge from this device? This cannot be undone.',
    )
    if (!ok) return
    try {
      if (auth.enabled) await auth.wipeAll()
      else await repo.clearAll()
      toast('Everything deleted')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete everything.')
    }
  }

  return (
    <main className="page">
      <header>
        <span className="eyebrow">On this device</span>
        <h1>You</h1>
      </header>

      <AccountCard />

      <section className="card stack" aria-labelledby="acc-heading">
        <h2 id="acc-heading">Guess accuracy</h2>
        {accuracy.made === 0 ? (
          <p className="muted">Add a photo when you log a dog, guess its breed, then see the reveal. Your hit rate shows up here.</p>
        ) : (
          <>
            <p>
              <strong className="mono" style={{ fontSize: '1.6rem' }}>{Math.round((accuracy.rate ?? 0) * 100)}%</strong>{' '}
              <span className="muted">
                {accuracy.correct} of {accuracy.made} {accuracy.made === 1 ? 'guess' : 'guesses'} right
              </span>
            </p>
            <div className="dots" role="img" aria-label={`Last ${accuracy.recent.length} guesses, oldest first: ${accuracy.recent.map((r) => (r ? 'right' : 'wrong')).join(', ')}`}>
              {accuracy.recent.map((r, i) => (
                <span key={i} className={`dot ${r ? 'dot--yes' : ''}`} />
              ))}
            </div>
            <p className="muted small">Filled dots are right guesses. Most recent on the right.</p>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="goal-set">
        <h2 id="goal-set">Weekly goal</h2>
        <div className="row row--between">
          <span>Dogs to log each week</span>
          <span className="row">
            <button type="button" className="btn btn--small" aria-label="Decrease weekly goal" onClick={() => repo.setSetting('weeklyGoal', Math.max(1, settings.weeklyGoal - 1))}>
              −
            </button>
            <strong className="mono" aria-live="polite">{settings.weeklyGoal}</strong>
            <button type="button" className="btn btn--small" aria-label="Increase weekly goal" onClick={() => repo.setSetting('weeklyGoal', Math.min(50, settings.weeklyGoal + 1))}>
              +
            </button>
          </span>
        </div>
        <p className="muted small">Weeks start on Monday. Missing a week never costs you anything.</p>
      </section>

      <section className="card stack" aria-labelledby="loc-heading">
        <h2 id="loc-heading">Location</h2>
        <div className="row row--between">
          <span id="loc-label" className="grow">Add neighborhood automatically</span>
          <div className="segmented" role="group" aria-labelledby="loc-label">
            <button type="button" aria-pressed={settings.locationMode === 'auto'} onClick={() => repo.setSetting('locationMode', 'auto')}>On</button>
            <button type="button" aria-pressed={settings.locationMode === 'off'} onClick={() => repo.setSetting('locationMode', 'off')}>Off</button>
          </div>
        </div>
        <p className="muted small">
          Only your neighborhood name is saved, never exact coordinates. Your position is rounded to about 1 km before a map service is asked for the name.
        </p>
      </section>

      <section className="card stack" aria-labelledby="ident-heading">
        <h2 id="ident-heading">Breed suggestions</h2>
        <div className="row row--between">
          <span id="ident-label" className="grow">Suggest breeds from photos</span>
          <div className="segmented" role="group" aria-labelledby="ident-label">
            <button type="button" aria-pressed={settings.identifyPhotos} onClick={() => repo.setSetting('identifyPhotos', true)}>On</button>
            <button type="button" aria-pressed={!settings.identifyPhotos} onClick={() => repo.setSetting('identifyPhotos', false)}>Off</button>
          </div>
        </div>
        <p className="muted small">
          When this is on and you are signed in, a small copy of a dog photo you add is sent to Google Cloud Vision to suggest a breed. It is not
          kept there by Dogdex, and the copy has no location data. When it is off, photos never leave your device.
        </p>
        {settings.identifyPhotos && !auth.user && <p className="small">Sign in above to use suggestions.</p>}
      </section>

      <section className="card stack" aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p className="muted small">Everything stays on this device. Browsers can clear site data, so keep a backup.</p>
        <button type="button" className="btn" onClick={download}>Export backup (.json)</button>
        <input ref={importInput} className="sr-only" aria-hidden="true" type="file" accept="application/json,.json" tabIndex={-1} onChange={(e) => restore(e.target.files?.[0])} />
        <button type="button" className="btn" onClick={() => importInput.current?.click()}>Import backup</button>
        <button type="button" className="btn" onClick={keepData}>
          Ask the browser to keep my data{persisted === true ? ' ✓' : ''}
        </button>
        <button type="button" className="btn btn--ghost btn--danger" onClick={wipe}>Delete everything</button>
      </section>
    </main>
  )
}
