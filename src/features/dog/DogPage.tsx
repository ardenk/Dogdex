import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BreedPicker } from '../../components/BreedPicker'
import type { BreedSelection } from '../../components/BreedPicker'
import { Celebration } from '../../components/Celebration'
import { GroupSelect } from '../../components/GroupSelect'
import { PhotoManager } from '../../components/PhotoManager'
import { PhotoStrip } from '../../components/PhotoStrip'
import { RarityMark } from '../../components/RarityMark'
import { Silhouette } from '../../components/Silhouette'
import { StickerLayer } from '../../components/StickerLayer'
import { StickerPicker } from '../../components/StickerPicker'
import { useToast } from '../../components/toast-context'
import { breedsById } from '../../data'
import type { BadgeDef } from '../../data'
import { breedName, dogGroupId, dogTitle, formatDateTime, ordinal } from '../../domain/format'
import { MAX_STICKERS_PER_DOG } from '../../domain/types'
import type { GiphySticker } from '../../services/giphy'
import { getCoarseLocation } from '../../services/location'
import { awardNewBadges } from '../../storage/awardBadges'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'
import { useDogPhotos } from '../../storage/useDogPhotos'
import { usePhotoUrl } from '../../storage/usePhotoUrl'

export function DogPage() {
  const { dogId = '' } = useParams()
  const { snapshot, settings } = useData()
  const navigate = useNavigate()
  const toast = useToast()
  const dog = snapshot.dogs.find((d) => d.id === dogId)
  const encounters = snapshot.encounters.filter((e) => e.dogId === dogId).sort((a, b) => b.metAt - a.metAt)
  const photoIds = useDogPhotos(dogId)
  const [chosenPhotoId, setChosenPhotoId] = useState<string | null>(null)
  // The photo being shown: the one tapped in the strip if it still exists, otherwise the cover.
  const shownId = chosenPhotoId && photoIds.includes(chosenPhotoId) ? chosenPhotoId : (dog?.primaryPhotoId ?? photoIds[0])
  const photoUrl = usePhotoUrl(shownId, 'full')
  const stickers = snapshot.stickers.filter((s) => s.dogId === dogId)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', ownerName: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [badges, setBadges] = useState<BadgeDef[]>([])
  const [changingBreed, setChangingBreed] = useState(false)
  const [pendingCustom, setPendingCustom] = useState<string | null>(null)
  const [pendingGroup, setPendingGroup] = useState('')
  const [decorating, setDecorating] = useState(false)
  const [managingPhotos, setManagingPhotos] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = stickers.find((s) => s.id === selectedId) ?? null

  if (!dog) {
    return (
      <main className="page">
        <Link to="/" className="back-link">← Home</Link>
        <p>That dog isn’t here anymore.</p>
      </main>
    )
  }

  const breed = dog.breedId ? breedsById[dog.breedId] : undefined
  const shownIndex = shownId ? photoIds.indexOf(shownId) : -1
  // Stickers belong to the cover photo, so they're only drawn while it (or the silhouette) is showing.
  const onCover = !dog.primaryPhotoId || shownId === dog.primaryPhotoId
  const photoAlt = photoIds.length > 1 && shownIndex >= 0 ? `${dogTitle(dog)}, photo ${shownIndex + 1} of ${photoIds.length}` : `${dogTitle(dog)}, a ${breedName(dog)}`

  const metAgain = async () => {
    if (busy) return
    setBusy(true)
    try {
      // Use a cached/quick location if available; never make the tap wait long.
      const loc =
        settings.locationMode === 'auto'
          ? await Promise.race([getCoarseLocation(), new Promise<null>((r) => setTimeout(() => r(null), 1500))])
          : null
      await repo.addEncounter(dog.id, { metAt: Date.now(), placeLabel: loc?.placeLabel, geoCell: loc?.placeLabel ? loc.geoCell : undefined })
      const fresh = await awardNewBadges(repo)
      toast(`Met ${dog.name ?? 'this dog'} again · ${ordinal(encounters.length + 1)} time`)
      if (fresh.length) setBadges(fresh)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = () => {
    setForm({ name: dog.name ?? '', ownerName: dog.ownerName ?? '', note: dog.note ?? '' })
    setEditing(true)
  }

  const saveEdit = async () => {
    await repo.updateDog(dog.id, form)
    setEditing(false)
    toast('Saved')
  }

  const applyBreed = async (breed: { breedId: string | null; customBreedLabel?: string; customGroupId?: string }) => {
    try {
      await repo.updateDogBreed(dog.id, breed)
      const fresh = await awardNewBadges(repo)
      setChangingBreed(false)
      setPendingCustom(null)
      setPendingGroup('')
      toast('Breed updated')
      if (fresh.length) setBadges(fresh)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change the breed.')
    }
  }

  const onPickBreed = (sel: BreedSelection) => {
    if (sel.breedId) void applyBreed({ breedId: sel.breedId })
    else if (sel.customLabel) {
      setPendingCustom(sel.customLabel)
      setPendingGroup('')
    }
  }

  const addSticker = async (g: GiphySticker) => {
    setPickerOpen(false)
    try {
      const s = await repo.addSticker(dog.id, { giphyId: g.giphyId, title: g.title, url: g.url, stillUrl: g.stillUrl, width: g.width, height: g.height })
      setSelectedId(s.id)
      setDecorating(true)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that sticker.')
    }
  }

  const remove = async () => {
    if (!window.confirm(`Remove ${dogTitle(dog)} from your Dogdex? This can't be undone.`)) return
    await repo.deleteDog(dog.id)
    toast('Removed')
    navigate('/dogdex')
  }

  return (
    <main className="page">
      <Link to={breed ? `/dogdex/breed/${breed.id}` : '/dogdex'} className="back-link">
        ← {breedName(dog)}
      </Link>

      <div className={`hero ${decorating ? 'hero--decorating' : ''}`}>
        {photoUrl ? <img src={photoUrl} alt={photoAlt} /> : <Silhouette variant={dogGroupId(dog) ?? 'mixed'} />}
        {stickers.length > 0 && onCover && (
          <StickerLayer
            stickers={stickers}
            editing={decorating}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={(id, patch) => repo.updateSticker(id, patch)}
          />
        )}
      </div>

      {(photoIds.length > 1 || (managingPhotos && photoIds.length > 0)) && (
        <PhotoStrip photoIds={photoIds} selectedId={shownId} coverId={dog.primaryPhotoId} onSelect={setChosenPhotoId} />
      )}

      <header className="stack">
        <h1>{dogTitle(dog)}</h1>
        <div className="row row--wrap">
          {breed ? (
            <Link to={`/dogdex/breed/${breed.id}`}>{breed.name}</Link>
          ) : (
            <Link to={`/dogdex/other/${encodeURIComponent(dog.customBreedLabel ?? '')}`}>{breedName(dog)}</Link>
          )}
          {breed && <RarityMark rarity={breed.rarity} />}
        </div>
        {dog.ownerName && <p className="muted">Owner: {dog.ownerName}</p>}
        {dog.note && <p>{dog.note}</p>}
      </header>

      <button type="button" className="btn btn--primary btn--big btn--block" onClick={metAgain} disabled={busy}>
        Met again
      </button>

      <div className="action-grid">
        <button
          type="button"
          className="btn"
          aria-pressed={managingPhotos}
          onClick={() => {
            setManagingPhotos((v) => !v)
            setDecorating(false)
          }}
        >
          Photos{photoIds.length > 1 ? ` (${photoIds.length})` : ''}
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={decorating}
          onClick={() => {
            setDecorating((v) => !v)
            setManagingPhotos(false)
            setChosenPhotoId(null) // stickers live on the cover photo, so show it
          }}
        >
          Stickers
        </button>
        <Link to={`/share/${dog.id}`} className="btn">
          Share
        </Link>
        <button type="button" className="btn" onClick={editing ? () => setEditing(false) : startEdit}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {managingPhotos && <PhotoManager dog={dog} photoIds={photoIds} shownId={shownId} onChoose={setChosenPhotoId} />}

      {decorating && (
        <section className="card stack" aria-labelledby="stickers-heading">
          <div className="row row--between">
            <h2 id="stickers-heading">Stickers</h2>
            <span className="mono small">
              {stickers.length}/{MAX_STICKERS_PER_DOG}
            </span>
          </div>
          <button type="button" className="btn" onClick={() => setPickerOpen(true)} disabled={stickers.length >= MAX_STICKERS_PER_DOG}>
            Add a sticker
          </button>

          {selected ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="sticker-size">Size</label>
                <input
                  id="sticker-size"
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={Math.round(selected.scale * 100)}
                  onChange={(e) => repo.updateSticker(selected.id, { scale: Number(e.target.value) / 100 })}
                />
              </div>
              <div className="field">
                <label htmlFor="sticker-rotate">Rotate</label>
                <input
                  id="sticker-rotate"
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={Math.round(selected.rotation)}
                  onChange={(e) => repo.updateSticker(selected.id, { rotation: Number(e.target.value) })}
                />
              </div>
              <div className="row">
                <button type="button" className="btn grow" onClick={() => repo.updateSticker(selected.id, { toFront: true })}>
                  Bring to front
                </button>
                <button
                  type="button"
                  className="btn btn--danger grow"
                  onClick={async () => {
                    await repo.removeSticker(selected.id)
                    setSelectedId(null)
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <p className="muted small">
              {stickers.length ? 'Tap a sticker to select it. Drag with one finger to move it; pinch and twist with two fingers to resize and rotate. Arrow keys also move it.' : 'Pick a sticker, then drag it where you want it on the photo.'}
            </p>
          )}
          <button type="button" className="btn btn--primary" onClick={() => { setDecorating(false); setSelectedId(null) }}>
            Done
          </button>
        </section>
      )}

      {editing && (
        <div className="card stack">
          <div className="stack">
            <span className="label">
              <strong>Breed</strong>
            </span>
            <p>{breedName(dog)}</p>
            <button type="button" className="btn btn--small" aria-expanded={changingBreed} onClick={() => { setChangingBreed((v) => !v); setPendingCustom(null) }}>
              {changingBreed ? 'Cancel breed change' : 'Change breed or category'}
            </button>
            {changingBreed && !pendingCustom && (
              <>
                <BreedPicker recentBreedIds={[]} onSelect={onPickBreed} label="Pick the correct breed" />
                {!dog.breedId && dog.customBreedLabel && (
                  <Link to={`/dogdex/other/${encodeURIComponent(dog.customBreedLabel)}`} className="small">
                    Rename “{dog.customBreedLabel}” or change its category
                  </Link>
                )}
              </>
            )}
            {changingBreed && pendingCustom && (
              <div className="card card--flat stack">
                <p>
                  Use <strong>{pendingCustom}</strong> as this dog’s breed?
                </p>
                <GroupSelect value={pendingGroup} onChange={setPendingGroup} label="Category" />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void applyBreed({ breedId: null, customBreedLabel: pendingCustom, customGroupId: pendingGroup })}
                >
                  Save breed
                </button>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="e-name">Dog’s name</label>
            <input id="e-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e-owner">Owner’s name</label>
            <input id="e-owner" className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e-note">Note</label>
            <textarea id="e-note" className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <button type="button" className="btn btn--primary" onClick={saveEdit}>
            Save changes
          </button>
          <button type="button" className="btn btn--ghost btn--danger" onClick={remove}>
            Remove this dog
          </button>
        </div>
      )}

      <section className="stack" aria-labelledby="history-heading">
        <h2 id="history-heading">Met {encounters.length} {encounters.length === 1 ? 'time' : 'times'}</h2>
        <ul className="card history">
          {encounters.map((e) => (
            <li key={e.id}>
              <span>{formatDateTime(e.metAt)}</span>
              <span className="muted">{e.placeLabel ?? ''}</span>
            </li>
          ))}
        </ul>
      </section>

      {pickerOpen && <StickerPicker onPick={addSticker} onClose={() => setPickerOpen(false)} />}

      {badges.length > 0 && (
        <Celebration title="Nice work!" glyph={badges[0].glyph} badges={badges} onClose={() => setBadges([])} />
      )}
    </main>
  )
}
