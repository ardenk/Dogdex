import { useRef, useState } from 'react'
import { MAX_PHOTOS_PER_DOG } from '../domain/types'
import type { Dog } from '../domain/types'
import { processImage } from '../services/images/resize'
import { repo } from '../storage/localRepo'
import { useAuth } from '../sync/auth-context'
import { useToast } from './toast-context'

interface Props {
  dog: Dog
  photoIds: string[]
  /** The photo currently shown in the photo box (the one Make cover and Delete act on). */
  shownId: string | undefined
  onChoose: (id: string | null) => void
}

/** Add photos (camera or library, several at once), choose the cover, and delete the photo being shown. */
export function PhotoManager({ dog, photoIds, shownId, onChoose }: Props) {
  const toast = useToast()
  const { user } = useAuth()
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const full = photoIds.length >= MAX_PHOTOS_PER_DOG
  const isCover = !!shownId && shownId === dog.primaryPhotoId

  const add = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [] // copy first: clearing the input empties the live FileList
    if (camera.current) camera.current.value = ''
    if (library.current) library.current.value = ''
    if (files.length === 0) return
    setBusy(true)
    let added = 0
    let last: string | undefined
    try {
      for (const file of files) {
        try {
          const photo = await repo.addDogPhoto(dog.id, await processImage(file))
          last = photo.id
          added++
        } catch (e) {
          // Stop at the limit; skip a file the browser can't read.
          const message = e instanceof Error ? e.message : ''
          toast(message.startsWith('A dog can have') ? message : 'Could not read one of those photos.')
          if (message.startsWith('A dog can have')) break
        }
      }
    } finally {
      setBusy(false)
    }
    if (last) onChoose(last)
    if (added) toast(added === 1 ? 'Photo added' : `${added} photos added`)
  }

  const makeCover = async () => {
    if (!shownId) return
    try {
      await repo.setPrimaryPhoto(dog.id, shownId)
      toast('Cover photo changed')
    } catch {
      toast('Could not change the cover photo.')
    }
  }

  const remove = async () => {
    if (!shownId) return
    const where = user ? 'from this device and from your cloud backup' : 'from this device'
    if (!window.confirm(`Delete this photo? It will be removed ${where}. This can't be undone.`)) return
    await repo.deletePhoto(shownId)
    onChoose(null)
    toast('Photo deleted')
  }

  return (
    <section className="card stack" aria-labelledby="photos-heading">
      <div className="row row--between">
        <h2 id="photos-heading">Photos</h2>
        <span className="mono small">
          {photoIds.length}/{MAX_PHOTOS_PER_DOG}
        </span>
      </div>

      {/* Hidden inputs: `capture` opens the camera; the other lets people pick several from their library. */}
      <input ref={camera} className="sr-only" aria-hidden="true" tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={(e) => void add(e.target.files)} data-testid="add-photo-camera" />
      <input ref={library} className="sr-only" aria-hidden="true" tabIndex={-1} type="file" accept="image/*" multiple onChange={(e) => void add(e.target.files)} data-testid="add-photo-library" />
      <div className="row">
        <button type="button" className="btn grow" onClick={() => camera.current?.click()} disabled={busy || full}>
          {busy ? 'Adding…' : 'Take photo'}
        </button>
        <button type="button" className="btn grow" onClick={() => library.current?.click()} disabled={busy || full}>
          {busy ? 'Adding…' : 'From library'}
        </button>
      </div>
      {full && <p className="muted small">That’s the most photos one dog can have. Delete one to add another.</p>}

      {photoIds.length > 0 ? (
        <>
          <p className="muted small">Tap a photo above to select it, then:</p>
          <div className="row">
            <button type="button" className="btn grow" onClick={makeCover} disabled={!shownId || isCover}>
              {isCover ? '★ Cover photo' : 'Make cover'}
            </button>
            <button type="button" className="btn btn--danger grow" onClick={remove} disabled={!shownId}>
              Delete photo
            </button>
          </div>
          <p className="muted small">The cover photo is the one shown on the Dogdex, in lists and on share cards. Stickers sit on it.</p>
        </>
      ) : (
        <p className="muted small">No photos yet. Add one to see it here and on the Dogdex.</p>
      )}
    </section>
  )
}
