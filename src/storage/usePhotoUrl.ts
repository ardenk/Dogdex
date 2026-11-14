import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from './db'

/** Object URL for a stored photo (thumbnail or full size). Revoked automatically. */
export function usePhotoUrl(photoId: string | undefined, size: 'thumb' | 'full' = 'thumb'): string | undefined {
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
  return url
}
