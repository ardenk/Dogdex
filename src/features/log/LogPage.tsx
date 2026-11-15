import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { BreedPicker } from '../../components/BreedPicker'
import { GroupSelect } from '../../components/GroupSelect'
import type { BreedSelection } from '../../components/BreedPicker'
import { Celebration } from '../../components/Celebration'
import { RarityMark } from '../../components/RarityMark'
import { useToast } from '../../components/toast-context'
import { breedsById, raritiesById } from '../../data'
import type { BadgeDef } from '../../data'
import { fromLocalInput, toLocalInput } from '../../domain/format'
import type { Suggestion } from '../../domain/types'
import { cloudEnabled } from '../../sync/client'
import { useAuth } from '../../sync/auth-context'
import { getIdentifier, identifyBreed } from '../../services/identify'
import { identifyStatus, identifyStatusMessage } from '../../services/identify/status'
import type { IdentifyStatus } from '../../services/identify/status'
import { processImage } from '../../services/images/resize'
import type { ProcessedImage } from '../../services/images/resize'
import { getCoarseLocation } from '../../services/location'
import { awardNewBadges } from '../../storage/awardBadges'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'

type Stage = 'pick' | 'guess' | 'reveal'

interface CelebrationState {
  title: string
  subtitle: string
  glyph: string
  badges: BadgeDef[]
  viewHref: string
}

/** Most recently and most often logged breeds, for one-tap picks. */
function useRecentBreeds(): string[] {
  const { snapshot } = useData()
  return useMemo(() => {
    const byRecency = [...snapshot.dogs].sort((a, b) => b.lastMetAt - a.lastMetAt)
    const seen: string[] = []
    for (const d of byRecency) if (d.breedId && !seen.includes(d.breedId)) seen.push(d.breedId)
    return seen.slice(0, 6)
  }, [snapshot.dogs])
}

export function LogPage() {
  const navigate = useNavigate()
  // Opened from a quiz answer ("Spot one? Log it"): finishing or cancelling goes back to the quiz.
  const backTo = (useLocation().state as { from?: string } | null)?.from === 'quiz' ? '/quiz' : '/'
  const toast = useToast()
  const { settings } = useData()
  const auth = useAuth()
  const recent = useRecentBreeds()
  const [params] = useSearchParams()

  const [stage, setStage] = useState<Stage>('pick')
  const [photo, setPhoto] = useState<{ processed: ProcessedImage; url: string } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [guess, setGuess] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  /** Why there are no suggestions (off, offline, an error), shown instead of the list. */
  const [suggestNote, setSuggestNote] = useState<{ text: string; status: IdentifyStatus } | null>(null)
  /** Which identifier produced the suggestions; 'none' when the photo was not sent anywhere. Saved with the guess. */
  const [identifierId, setIdentifierId] = useState('none')
  const [showOtherPicker, setShowOtherPicker] = useState(false)

  const preselected = params.get('breed')
  const [selected, setSelected] = useState<BreedSelection | null>(
    preselected && breedsById[preselected] ? { breedId: preselected } : null,
  )

  const [customGroupId, setCustomGroupId] = useState('')
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [note, setNote] = useState('')
  const [metAt, setMetAt] = useState(() => toLocalInput(Date.now()))
  const [place, setPlace] = useState('')
  const [geoCell, setGeoCell] = useState<string | undefined>()
  const [locating, setLocating] = useState(false)

  const [saving, setSaving] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationState | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  // Location is fetched in the background and never blocks saving.
  useEffect(() => {
    if (settings.locationMode !== 'auto') return
    let cancelled = false
    setLocating(true)
    getCoarseLocation().then((loc) => {
      if (cancelled) return
      setLocating(false)
      if (loc) {
        setPlace((p) => p || loc.placeLabel || '')
        setGeoCell(loc.geoCell)
      }
    })
    return () => {
      cancelled = true
    }
  }, [settings.locationMode])

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },
    [photo],
  )

  const onPhotoChosen = async (file: File | undefined) => {
    if (!file) return
    setPhotoBusy(true)
    try {
      const processed = await processImage(file)
      setPhoto({ processed, url: URL.createObjectURL(processed.blob) })
      setSelected(null)
      setGuess(null)
      setSuggestions(null)
      setStage('guess')
    } catch {
      toast('Could not read that photo. Try another, or pick the breed instead.')
    } finally {
      setPhotoBusy(false)
      // Clear both so choosing the same photo again still fires a change.
      if (cameraInput.current) cameraInput.current.value = ''
      if (libraryInput.current) libraryInput.current.value = ''
    }
  }

  const reveal = useCallback(
    (guessed: string | null) => {
      if (!photo) return
      setGuess(guessed)
      setStage('reveal')
      setSuggestions(null)
      setSuggestNote(null)
      // The photo only leaves the device when the user has opted in, is signed in, and is online.
      const status = identifyStatus({ cloudEnabled, signedIn: !!auth.user, optedIn: settings.identifyPhotos, online: navigator.onLine })
      const why = identifyStatusMessage(status)
      if (why) {
        setIdentifierId('none')
        setSuggestions([])
        setSuggestNote({ text: why, status })
        return
      }
      setIdentifierId(getIdentifier().id)
      identifyBreed(photo.processed.blob)
        .then(setSuggestions)
        .catch((e: unknown) => {
          setSuggestions([])
          setSuggestNote({ text: e instanceof Error ? e.message : 'Could not get suggestions. Pick the breed below.', status })
        })
    },
    [photo, auth.user, settings.identifyPhotos],
  )

  const removePhoto = () => {
    setPhoto(null)
    setGuess(null)
    setSuggestions(null)
    setSelected(null)
    setStage('pick')
  }

  const save = async () => {
    if (!selected || saving) return
    setSaving(true)
    try {
      const result = await repo.logSighting({
        breedId: selected.breedId ?? null,
        customBreedLabel: selected.customLabel,
        customGroupId: selected.customLabel ? customGroupId : undefined,
        name,
        ownerName: owner,
        note,
        metAt: fromLocalInput(metAt),
        placeLabel: place,
        geoCell: place.trim() ? geoCell : undefined,
        photo: photo?.processed,
        guess: photo ? { guessedBreedId: guess, suggestions: suggestions ?? [], identifierId } : undefined,
      })
      const badges = await awardNewBadges(repo)
      const breed = selected.breedId ? breedsById[selected.breedId] : undefined
      const tier = breed ? raritiesById[breed.rarity] : undefined
      const label = breed?.name ?? selected.customLabel ?? 'dog'
      const guessRight = photo && guess && guess === selected.breedId
      const base = `${result.dog.name ?? label} added`

      if (tier?.celebration === 'full' || badges.length > 0) {
        setCelebration({
          title: tier?.celebration === 'full' ? tier.message : 'Nice work!',
          subtitle: breed ? `${breed.name}${result.isNewBreed ? ' · new to your Dogdex' : ''}` : label,
          glyph: tier?.celebration === 'full' ? tier.glyph : (badges[0]?.glyph ?? '✓'),
          badges,
          viewHref: `/dog/${result.dog.id}`,
        })
        return
      }
      const extra = [
        tier?.celebration === 'toast' ? tier.message : result.isNewBreed ? 'New breed for your Dogdex!' : '',
        guessRight ? 'Your guess was right!' : '',
      ]
        .filter(Boolean)
        .join(' ')
      toast(`${base}. ${extra}`.trim())
      navigate(backTo)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong saving that dog.')
    } finally {
      setSaving(false)
    }
  }

  const selectedBreed = selected?.breedId ? breedsById[selected.breedId] : undefined
  const selectedLabel = selectedBreed?.name ?? selected?.customLabel
  const guessBreed = guess ? breedsById[guess] : undefined

  return (
    <div className="app">
      <main className="page page--bare">
        <div className="topbar">
          <Link to={backTo} className="back-link">
            {backTo === '/quiz' ? '← Back to quiz' : '← Cancel'}
          </Link>
          <h1 style={{ fontSize: '1.4rem' }}>Log a dog</h1>
        </div>

        {/* Photo (optional) */}
        {!photo && (
          <div className="stack">
            {/* Two hidden inputs: `capture` opens the camera directly; without it the phone offers its photo library. */}
            <input
              ref={cameraInput}
              className="sr-only"
              aria-hidden="true"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onPhotoChosen(e.target.files?.[0])}
              tabIndex={-1}
              data-testid="photo-camera"
            />
            <input
              ref={libraryInput}
              className="sr-only"
              aria-hidden="true"
              type="file"
              accept="image/*"
              onChange={(e) => onPhotoChosen(e.target.files?.[0])}
              tabIndex={-1}
              data-testid="photo-library"
            />
            <div className="row">
              <button type="button" className="btn btn--big grow" onClick={() => cameraInput.current?.click()} disabled={photoBusy}>
                {photoBusy ? 'Reading…' : 'Take photo'}
              </button>
              <button type="button" className="btn btn--big grow" onClick={() => libraryInput.current?.click()} disabled={photoBusy}>
                {photoBusy ? 'Reading…' : 'From library'}
              </button>
            </div>
            <p className="muted small">A photo is optional. You can also just pick the breed below.</p>
          </div>
        )}

        {photo && (
          <div className="stack">
            <img className="photo-preview" src={photo.url} alt="The photo you added" />
            <button type="button" className="btn btn--small btn--ghost" onClick={removePhoto}>
              Remove photo
            </button>
          </div>
        )}

        {/* Names (optional): asked up front, so you can fill them in while you are with the dog, before choosing the breed. */}
        <div className="card stack">
          <div className="field">
            <label htmlFor="dog-name">Dog’s name</label>
            <input id="dog-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Optional" />
          </div>
          <div className="field">
            <label htmlFor="owner-name">Owner’s name</label>
            <input id="owner-name" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="off" placeholder="Optional" />
          </div>
        </div>

        {/* Stage: pick (no photo) */}
        {!photo && !selected && (
          <BreedPicker
            recentBreedIds={recent}
            onSelect={setSelected}
            label="Or pick the breed"
            autoFocus={false}
          />
        )}

        {/* Stage: guess first */}
        {photo && stage === 'guess' && (
          <div className="stack">
            <h2>What breed do you think it is?</h2>
            <p className="muted small">Guess first, then see suggestions. Your accuracy is tracked privately.</p>
            <button type="button" className="btn btn--block" onClick={() => reveal(null)}>
              Skip the guess, show suggestions
            </button>
            <BreedPicker recentBreedIds={recent} allowCustom={false} label="Your guess" onSelect={(s) => s.breedId && reveal(s.breedId)} />
          </div>
        )}

        {/* Stage: reveal */}
        {photo && stage === 'reveal' && (
          <div className="stack">
            <h2>Suggestions</h2>
            {guessBreed && (
              <p>
                You guessed <strong>{guessBreed.name}</strong>.
              </p>
            )}
            {suggestions === null && <p className="muted" aria-live="polite">Looking…</p>}
            {suggestions && suggestions.length === 0 && (
              <p className="muted" role="status">
                {suggestNote?.text ?? 'No confident suggestions for this photo. Pick the breed below.'}
                {(suggestNote?.status === 'off' || suggestNote?.status === 'sign-in') && (
                  <>
                    {' '}
                    <Link to="/you">Open You</Link>
                  </>
                )}
              </p>
            )}
            {suggestions?.map((s) => {
              const b = breedsById[s.breedId]
              const on = selected?.breedId === s.breedId
              return (
                <button key={s.breedId} type="button" className="suggestion" aria-pressed={on} onClick={() => setSelected({ breedId: s.breedId })}>
                  <span>
                    <strong>{b.name}</strong>
                    {guess === s.breedId ? ' · your guess' : ''}
                  </span>
                  <span className="mono">{Math.round(s.confidence * 100)}%</span>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                  </span>
                </button>
              )
            })}
            {identifierId !== 'none' && <p className="muted small">{getIdentifier().label}</p>}
            {guessBreed && !suggestions?.some((s) => s.breedId === guessBreed.id) && (
              <button
                type="button"
                className="suggestion"
                aria-pressed={selected?.breedId === guessBreed.id}
                onClick={() => setSelected({ breedId: guessBreed.id })}
              >
                <span>
                  <strong>Keep my guess: {guessBreed.name}</strong>
                </span>
                <span />
              </button>
            )}
            <button type="button" className="btn btn--block" onClick={() => setShowOtherPicker((v) => !v)} aria-expanded={showOtherPicker}>
              Something else
            </button>
            {showOtherPicker && (
              <BreedPicker
                recentBreedIds={recent}
                onSelect={(s) => {
                  setSelected(s)
                  setShowOtherPicker(false)
                }}
              />
            )}
          </div>
        )}

        {/* Selected breed summary */}
        {selected && selectedLabel && (!photo || stage === 'reveal') && (
          <div className="card row row--between">
            <div>
              <span className="eyebrow">Breed</span>
              <p>
                <strong>{selectedLabel}</strong>
              </p>
              {selectedBreed && <RarityMark rarity={selectedBreed.rarity} />}
            </div>
            {!photo && (
              <button type="button" className="btn btn--small" onClick={() => setSelected(null)}>
                Change
              </button>
            )}
          </div>
        )}

        {/* A breed that isn't in the Dogdex yet: say which category it belongs to */}
        {selected?.customLabel && (!photo || stage === 'reveal') && (
          <div className="card card--flat">
            <GroupSelect
              value={customGroupId}
              onChange={setCustomGroupId}
              label="Which category is this breed in?"
              hint="It will appear in that category in your Dogdex. You can change it later."
            />
          </div>
        )}

        {/* The rest of the details (all optional), shown once there is a breed. The names are up with the photo. */}
        {selected && (!photo || stage === 'reveal') && (
          <div className="card stack">
            <div className="field">
              <label htmlFor="dog-note">Note</label>
              <textarea id="dog-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor="met-at">When</label>
              <input id="met-at" className="input" type="datetime-local" value={metAt} onChange={(e) => setMetAt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="place">Neighborhood</label>
              <input
                id="place"
                className="input"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder={locating ? 'Finding your neighborhood…' : 'Optional'}
                autoComplete="off"
              />
              <span className="muted small">Only the neighborhood is saved, never your exact location.</span>
            </div>
          </div>
        )}
      </main>

      <div className="log-footer">
        <button type="button" className="btn btn--primary btn--big btn--block" disabled={!selected || saving || (!!photo && stage !== 'reveal')} onClick={save}>
          {saving ? 'Saving…' : selectedLabel ? `Save ${selectedLabel}` : 'Pick a breed to save'}
        </button>
      </div>

      {celebration && (
        <Celebration
          {...celebration}
          onClose={() => {
            setCelebration(null)
            navigate(backTo)
          }}
        />
      )}
    </div>
  )
}
