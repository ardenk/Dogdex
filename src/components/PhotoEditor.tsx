import { useState } from 'react'
import { MAX_STICKERS_PER_PHOTO } from '../domain/types'
import type { Dog, Sticker } from '../domain/types'
import { repo } from '../storage/localRepo'
import { useAuth } from '../sync/auth-context'
import { PhotoFraming } from './PhotoFraming'
import { useToast } from './toast-context'

interface Props {
  dog: Dog
  /** The photo being edited (the one showing above). */
  photoId: string
  /** The stickers on this photo. */
  stickers: Sticker[]
  /** The sticker picked on the photo, if any. */
  selected: Sticker | null
  onSelect: (id: string | null) => void
  onOpenPicker: () => void
  /** After this photo is deleted. */
  onDeleted: () => void
  /** Closes the frame and undoes sticker changes made since it opened. */
  onCancel: () => void
  /** Closes the frame, keeping everything. */
  onDone: () => void
}

/**
 * Everything for changing one photo: its framing, whether it is the cover, deleting it, and its stickers.
 * Framing, cover and delete take effect as you do them; sticker changes can be undone with Cancel.
 */
export function PhotoEditor({ dog, photoId, stickers, selected, onSelect, onOpenPicker, onDeleted, onCancel, onDone }: Props) {
  const toast = useToast()
  const { user } = useAuth()
  const [framing, setFraming] = useState(false)
  const isCover = dog.primaryPhotoId === photoId

  const makeCover = async () => {
    try {
      await repo.setPrimaryPhoto(dog.id, photoId)
      toast('Cover photo changed')
    } catch {
      toast('Could not change the cover photo.')
    }
  }

  const remove = async () => {
    const where = user ? 'from this device and from your cloud backup' : 'from this device'
    if (!window.confirm(`Delete this photo? It will be removed ${where}, along with its stickers. This can't be undone.`)) return
    await repo.deletePhoto(photoId)
    toast('Photo deleted')
    onDeleted()
  }

  return (
    <section className="card stack" aria-labelledby="edit-photo-heading">
      <h2 id="edit-photo-heading">Edit photo</h2>

      <button type="button" className="btn btn--block" onClick={() => setFraming((v) => !v)} aria-expanded={framing}>
        Adjust framing
      </button>
      {framing && <PhotoFraming key={photoId} photoId={photoId} onDone={() => setFraming(false)} />}

      <div className="row">
        <button type="button" className="btn grow" onClick={makeCover} disabled={isCover}>
          {isCover ? '★ Cover photo' : 'Make cover'}
        </button>
        <button type="button" className="btn btn--danger grow" onClick={remove}>
          Delete photo
        </button>
      </div>
      <p className="muted small">The cover photo is the one shown on the Dogdex, in lists and on share cards.</p>

      <div className="stack" role="group" aria-labelledby="stickers-heading">
        <div className="row row--between">
          <h3 id="stickers-heading">Stickers on this photo</h3>
          <span className="mono small">
            {stickers.length}/{MAX_STICKERS_PER_PHOTO}
          </span>
        </div>

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
                  onSelect(null)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Adding is for when nothing is selected above: with a sticker selected, these controls are for that sticker. */}
            <button type="button" className="btn" onClick={onOpenPicker} disabled={stickers.length >= MAX_STICKERS_PER_PHOTO}>
              Add a sticker
            </button>
            <p className="muted small">
              {stickers.length ? 'Tap a sticker to select it. Drag with one finger to move it; pinch and twist with two fingers to resize and rotate. Arrow keys also move it.' : 'Pick a sticker, then drag it where you want it on the photo.'}
            </p>
          </>
        )}
      </div>

      <div className="row">
        <button type="button" className="btn grow" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary grow" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  )
}
