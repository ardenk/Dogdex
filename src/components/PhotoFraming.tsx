import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useRef, useState } from 'react'
import { CENTER, clampFocus, focusOf, objectPosition } from '../domain/photoFocus'
import type { Focus } from '../domain/photoFocus'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'
import { usePhoto } from '../storage/usePhotoUrl'
import { useToast } from './toast-context'

interface Props {
  photoId: string
  onDone: () => void
}

/**
 * Choose which part of a photo stays in view when it is cropped (the dog page, tiles, share cards). The whole photo is
 * shown: tap or drag to mark the dog's head, or nudge with the sliders. The preview below shows the real crop.
 */
export function PhotoFraming({ photoId, onDone }: Props) {
  const toast = useToast()
  const photo = useLiveQuery(() => db.photos.get(photoId), [photoId])
  const { url } = usePhoto(photoId, 'full')
  // Until the player changes something, the saved focus is used.
  const [picked, setPicked] = useState<Focus | null>(null)
  const focus = picked ?? focusOf(photo)
  const [saving, setSaving] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const xId = useId()
  const yId = useId()

  const place = (clientX: number, clientY: number) => {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    setPicked(clampFocus({ x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await repo.setPhotoFocus(photoId, focus)
      toast('Framing saved')
      onDone()
    } catch {
      toast('Could not save the framing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card stack" aria-labelledby="framing-heading">
      <h2 id="framing-heading">Adjust framing</h2>
      <p className="muted small">Tap the photo where the dog’s head is. Photos are cropped to fit, and this keeps the dog in view.</p>

      <div
        ref={frame}
        className="framing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          place(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => e.buttons === 1 && place(e.clientX, e.clientY)}
      >
        {url && <img src={url} alt="The whole photo. Tap to mark the dog’s head." draggable={false} />}
        <span className="framing__marker" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }} aria-hidden="true" />
      </div>

      <div className="field">
        <label htmlFor={xId}>Left to right</label>
        <input id={xId} type="range" min={0} max={100} value={Math.round(focus.x * 100)} onChange={(e) => setPicked({ ...focus, x: Number(e.target.value) / 100 })} />
      </div>
      <div className="field">
        <label htmlFor={yId}>Top to bottom</label>
        <input id={yId} type="range" min={0} max={100} value={Math.round(focus.y * 100)} onChange={(e) => setPicked({ ...focus, y: Number(e.target.value) / 100 })} />
      </div>

      <span className="eyebrow">Preview</span>
      <div className="framing-preview" data-testid="framing-preview">
        {url && photo && <img src={url} alt="" style={{ objectPosition: objectPosition(focus, photo.width, photo.height) }} />}
      </div>

      <div className="row">
        <button type="button" className="btn grow" onClick={() => setPicked(CENTER)}>
          Center
        </button>
        <button type="button" className="btn grow" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary grow" onClick={save} disabled={saving}>
          Save
        </button>
      </div>
    </section>
  )
}
