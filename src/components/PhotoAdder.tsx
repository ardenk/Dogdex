import { useRef, useState } from 'react'
import { MAX_PHOTOS_PER_DOG } from '../domain/types'
import type { Dog } from '../domain/types'
import { processImage } from '../services/images/resize'
import { repo } from '../storage/localRepo'
import { useToast } from './toast-context'

interface Props {
  dog: Dog
  photoCount: number
  /** Called with the last photo added, so it can be shown. The frame is closed by the caller. */
  onAdded: (photoId: string) => void
  onClose: () => void
}

/** Upload options only: take a photo with the camera, or choose several from the library. Editing a photo is a separate step. */
export function PhotoAdder({ dog, photoCount, onAdded, onClose }: Props) {
  const toast = useToast()
  const camera = useRef<HTMLInputElement>(null)
  const library = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const full = photoCount >= MAX_PHOTOS_PER_DOG

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
    if (added) toast(added === 1 ? 'Photo added' : `${added} photos added`)
    if (last) onAdded(last)
  }

  return (
    <section className="card stack" aria-labelledby="add-photo-heading">
      <div className="row row--between">
        <h2 id="add-photo-heading">Add a photo</h2>
        <span className="mono small">
          {photoCount}/{MAX_PHOTOS_PER_DOG}
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
      <button type="button" className="btn btn--block" onClick={onClose}>
        Cancel
      </button>
    </section>
  )
}
