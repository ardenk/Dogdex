import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

/** Ids of a dog's photos (deleted ones excluded), oldest first. Updates live as photos are added or deleted. */
export function useDogPhotos(dogId: string | undefined): string[] {
  return (
    useLiveQuery(async () => {
      if (!dogId) return []
      const photos = (await db.photos.where('dogId').equals(dogId).toArray()).filter((p) => !p.deletedAt)
      return photos.sort((a, b) => a.createdAt - b.createdAt).map((p) => p.id)
    }, [dogId]) ?? []
  )
}
