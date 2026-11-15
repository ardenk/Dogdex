import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { focusOf, objectPosition } from '../domain/photoFocus'
import { db } from './db'

export interface PhotoView {
  url: string | undefined
  /** `object-position` that keeps the dog in view when the photo is cropped to the 4:3 box. Spread onto the <img>. */
  style: CSSProperties | undefined
}

/** A stored photo (thumbnail or full size) as an object URL, plus the crop that keeps the dog in view. Revoked automatically. */
export function usePhoto(photoId: string | undefined, size: 'thumb' | 'full' = 'thumb'): PhotoView {
  const photo = useLiveQuery(() => (photoId ? db.photos.get(photoId) : undefined), [photoId])
  const blob = photo ? (size === 'thumb' ? photo.thumb : photo.blob) : undefined
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  const style = photo && photo.width > 0 && photo.height > 0 ? { objectPosition: objectPosition(focusOf(photo), photo.width, photo.height) } : undefined
  return { url, style }
}

/** Object URL for a stored photo (thumbnail or full size). Use usePhoto when the photo is cropped, so the dog stays in view. */
export function usePhotoUrl(photoId: string | undefined, size: 'thumb' | 'full' = 'thumb'): string | undefined {
  return usePhoto(photoId, size).url
}
