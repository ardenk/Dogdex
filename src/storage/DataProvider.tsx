import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DataContext } from './data-context'
import { repo } from './localRepo'

export function DataProvider({ children }: { children: ReactNode }) {
  const snapshot = useLiveQuery(() => repo.getSnapshot(), [])
  const settings = useLiveQuery(() => repo.getSettings(), [])
  // Stickers from before "a sticker belongs to one photo" (or arriving from an older device) get attached to their dog's cover photo.
  const hasLooseStickers = !!snapshot && snapshot.stickers.some((s) => !s.photoId && !!snapshot.dogs.find((d) => d.id === s.dogId)?.primaryPhotoId)
  useEffect(() => {
    if (hasLooseStickers) void repo.attachLooseStickers()
  }, [hasLooseStickers])
  if (!snapshot) return <p className="page muted">Loading your Dogdex…</p>
  return <DataContext.Provider value={{ snapshot, settings: settings ?? DEFAULT_SETTINGS }}>{children}</DataContext.Provider>
}
