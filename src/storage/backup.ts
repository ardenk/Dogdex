import { db } from './db'
import type { Photo } from '../domain/types'
import { isGiphyUrl } from '../services/giphy/validate'

/** Photos are Blobs, so a backup stores them as data URLs. */
type PhotoJson = Omit<Photo, 'blob' | 'thumb'> & { blob: string; thumb: string }

interface BackupFile {
  app: 'dogdex'
  version: 1
  exportedAt: number
  dogs: unknown[]
  encounters: unknown[]
  guesses: unknown[]
  badgeAwards: unknown[]
  settings: unknown[]
  stickers?: unknown[]
  photos: PhotoJson[]
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

const dataUrlToBlob = async (url: string): Promise<Blob> => (await fetch(url)).blob()

export async function exportBackup(): Promise<Blob> {
  const [dogs, encounters, guesses, badgeAwards, settings, photos, stickers] = await Promise.all([
    db.dogs.toArray(),
    db.encounters.toArray(),
    db.guesses.toArray(),
    db.badgeAwards.toArray(),
    db.settings.toArray(),
    db.photos.filter((p) => !p.deletedAt).toArray(),
    db.stickers.toArray(),
  ])
  const file: BackupFile = {
    app: 'dogdex',
    version: 1,
    exportedAt: Date.now(),
    dogs,
    encounters,
    guesses,
    badgeAwards,
    settings,
    stickers,
    photos: await Promise.all(
      photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob), thumb: await blobToDataUrl(p.thumb) })),
    ),
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

/** Replaces everything on this device with the backup. Returns the number of dogs imported. */
export async function importBackup(file: Blob): Promise<number> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(await file.text()) as BackupFile
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (parsed?.app !== 'dogdex' || parsed.version !== 1 || !Array.isArray(parsed.dogs)) {
    throw new Error('That does not look like a Dogdex backup.')
  }
  const photos: Photo[] = await Promise.all(
    (parsed.photos ?? []).map(async (p) => ({ ...p, blob: await dataUrlToBlob(p.blob), thumb: await dataUrlToBlob(p.thumb) })),
  )
  await db.transaction('rw', [db.dogs, db.encounters, db.photos, db.guesses, db.badgeAwards, db.settings, db.stickers], async () => {
    await Promise.all([db.stickers.clear(), db.dogs.clear(), db.encounters.clear(), db.photos.clear(), db.guesses.clear(), db.badgeAwards.clear(), db.settings.clear()])
    await db.dogs.bulkAdd(parsed.dogs as never[])
    await db.encounters.bulkAdd((parsed.encounters ?? []) as never[])
    await db.guesses.bulkAdd((parsed.guesses ?? []) as never[])
    await db.badgeAwards.bulkAdd((parsed.badgeAwards ?? []) as never[])
    await db.settings.bulkAdd((parsed.settings ?? []) as never[])
    // A backup file is untrusted input: keep only stickers that point at GIPHY.
    await db.stickers.bulkAdd(((parsed.stickers ?? []) as { url?: string; stillUrl?: string }[]).filter((s) => isGiphyUrl(s.url) && (!s.stillUrl || isGiphyUrl(s.stillUrl))) as never[])
    await db.photos.bulkAdd(photos)
  })
  return parsed.dogs.length
}
