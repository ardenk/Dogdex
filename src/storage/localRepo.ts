import { isGuessCorrect } from '../domain/guess'
import { newId } from '../domain/id'
import { clampFocus } from '../domain/photoFocus'
import { readQuizStats } from '../domain/quiz'
import { DEFAULT_SETTINGS, MAX_PHOTOS_PER_DOG, MAX_STICKERS_PER_PHOTO } from '../domain/types'
import type { Dog, Encounter, Guess, Photo, Settings, Snapshot, Sticker } from '../domain/types'
import { isGiphyUrl } from '../services/giphy/validate'
import { createDb, db as defaultDb } from './db'
import type { DogdexDB } from './db'
import type { EncounterInput, LogSightingInput, LogSightingResult, PhotoInput, Repository, StickerInput, StickerPatch } from './repo'

const clean = (s?: string) => {
  const t = s?.trim()
  return t ? t : undefined
}

export function createLocalRepo(db: DogdexDB = defaultDb): Repository {
  return {
    async getSnapshot(): Promise<Snapshot> {
      const [dogs, encounters, guesses, awards, stickers] = await Promise.all([
        db.dogs.toArray(),
        db.encounters.toArray(),
        db.guesses.toArray(),
        db.badgeAwards.toArray(),
        db.stickers.toArray(),
      ])
      const liveDogs = dogs.filter((d) => !d.deletedAt)
      const liveIds = new Set(liveDogs.map((d) => d.id))
      return {
        dogs: liveDogs,
        encounters: encounters.filter((e) => !e.deletedAt && liveIds.has(e.dogId)),
        guesses: guesses.filter((g) => !g.deletedAt && liveIds.has(g.dogId)),
        awards,
        stickers: stickers.filter((s) => !s.deletedAt && liveIds.has(s.dogId)),
      }
    },

    async logSighting(input: LogSightingInput): Promise<LogSightingResult> {
      const now = Date.now()
      const customBreedLabel = input.breedId ? undefined : clean(input.customBreedLabel)
      if (!input.breedId && !customBreedLabel) throw new Error('A breed is required')

      return db.transaction('rw', [db.dogs, db.encounters, db.photos, db.guesses], async () => {
        const existing = (await db.dogs.toArray()).filter((d) => !d.deletedAt)
        const isNewBreed = input.breedId
          ? !existing.some((d) => d.breedId === input.breedId)
          : !existing.some((d) => !d.breedId && d.customBreedLabel?.toLowerCase() === customBreedLabel?.toLowerCase())

        const dogId = newId()
        let primaryPhotoId: string | undefined
        if (input.photo) {
          primaryPhotoId = newId()
          await db.photos.add({ id: primaryPhotoId, dogId, ...input.photo, createdAt: now, updatedAt: now })
        }
        const dog: Dog = {
          id: dogId,
          breedId: input.breedId,
          customBreedLabel,
          customGroupId: input.breedId ? undefined : input.customGroupId || undefined,
          name: clean(input.name),
          ownerName: clean(input.ownerName),
          note: clean(input.note),
          primaryPhotoId,
          firstMetAt: input.metAt,
          lastMetAt: input.metAt,
          createdAt: now,
          updatedAt: now,
        }
        await db.dogs.add(dog)

        const encounter: Encounter = {
          id: newId(),
          dogId,
          metAt: input.metAt,
          placeLabel: clean(input.placeLabel),
          geoCell: input.geoCell,
          createdAt: now,
          updatedAt: now,
        }
        await db.encounters.add(encounter)

        if (input.guess) {
          const guess: Guess = {
            id: newId(),
            encounterId: encounter.id,
            dogId,
            photoId: primaryPhotoId,
            guessedBreedId: input.guess.guessedBreedId,
            suggestions: input.guess.suggestions,
            confirmedBreedId: input.breedId,
            correct: isGuessCorrect(input.guess.guessedBreedId, input.breedId),
            identifierId: input.guess.identifierId,
            createdAt: now,
            updatedAt: now,
          }
          await db.guesses.add(guess)
        }
        return { dog, encounter, isNewBreed }
      })
    },

    async addEncounter(dogId: string, input: EncounterInput): Promise<Encounter> {
      const now = Date.now()
      const encounter: Encounter = {
        id: newId(),
        dogId,
        metAt: input.metAt,
        placeLabel: clean(input.placeLabel),
        geoCell: input.geoCell,
        note: clean(input.note),
        createdAt: now,
        updatedAt: now,
      }
      await db.transaction('rw', [db.dogs, db.encounters], async () => {
        const dog = await db.dogs.get(dogId)
        if (!dog || dog.deletedAt) throw new Error('Dog not found')
        await db.encounters.add(encounter)
        await db.dogs.update(dogId, {
          lastMetAt: Math.max(dog.lastMetAt, input.metAt),
          firstMetAt: Math.min(dog.firstMetAt, input.metAt),
          updatedAt: now,
        })
      })
      return encounter
    },

    async updateDog(id, patch) {
      await db.dogs.update(id, {
        name: clean(patch.name),
        ownerName: clean(patch.ownerName),
        note: clean(patch.note),
        updatedAt: Date.now(),
      })
    },

    async addDogPhoto(dogId: string, input: PhotoInput): Promise<Photo> {
      const now = Date.now()
      return db.transaction('rw', [db.dogs, db.photos, db.stickers], async () => {
        const dog = await db.dogs.get(dogId)
        if (!dog || dog.deletedAt) throw new Error('Dog not found')
        const live = (await db.photos.where('dogId').equals(dogId).toArray()).filter((p) => !p.deletedAt)
        if (live.length >= MAX_PHOTOS_PER_DOG) throw new Error(`A dog can have up to ${MAX_PHOTOS_PER_DOG} photos`)
        // Strictly later than this dog's other photos, so their order (strip, "next photo takes over as cover") never ties.
        const createdAt = Math.max(now, ...(await db.photos.where('dogId').equals(dogId).toArray()).map((p) => p.createdAt + 1))
        const photo: Photo = { id: newId(), dogId, ...input, createdAt, updatedAt: now }
        await db.photos.add(photo)
        // Stickers that had no photo to sit on (from before dogs needed one) go onto the dog's first photo.
        if (live.length === 0) {
          for (const s of (await db.stickers.where('dogId').equals(dogId).toArray()).filter((x) => !x.deletedAt && !x.photoId)) {
            await db.stickers.update(s.id, { photoId: photo.id, updatedAt: now })
          }
        }
        const hasCover = !!dog.primaryPhotoId && live.some((p) => p.id === dog.primaryPhotoId)
        await db.dogs.update(dogId, { ...(hasCover ? {} : { primaryPhotoId: photo.id }), updatedAt: now })
        return photo
      })
    },

    async setPrimaryPhoto(dogId: string, photoId: string) {
      await db.transaction('rw', [db.dogs, db.photos], async () => {
        const photo = await db.photos.get(photoId)
        if (!photo || photo.dogId !== dogId || photo.deletedAt) throw new Error('Photo not found')
        await db.dogs.update(dogId, { primaryPhotoId: photoId, updatedAt: Date.now() })
      })
    },

    async setPhotoFocus(photoId: string, focus: { x: number; y: number }) {
      const { x, y } = clampFocus(focus)
      await db.transaction('rw', db.photos, async () => {
        const photo = await db.photos.get(photoId)
        if (!photo || photo.deletedAt) throw new Error('Photo not found')
        // updatedAt moves so the change is picked up by sync; the image bytes themselves are unchanged.
        await db.photos.update(photoId, { focusX: x, focusY: y, updatedAt: Date.now() })
      })
    },

    async deletePhoto(photoId: string) {
      const now = Date.now()
      await db.transaction('rw', [db.dogs, db.photos, db.stickers], async () => {
        const photo = await db.photos.get(photoId)
        if (!photo || photo.deletedAt) return
        // Its stickers go with it.
        for (const s of (await db.stickers.where('dogId').equals(photo.dogId).toArray()).filter((x) => !x.deletedAt && x.photoId === photoId)) {
          await db.stickers.update(s.id, { deletedAt: now, updatedAt: now })
        }
        // Free the storage now; the small record remains as a tombstone so the deletion can sync to other devices.
        const empty = new Blob([])
        await db.photos.update(photoId, { deletedAt: now, updatedAt: now, blob: empty, thumb: empty })
        const dog = await db.dogs.get(photo.dogId)
        if (dog && dog.primaryPhotoId === photoId) {
          const rest = (await db.photos.where('dogId').equals(photo.dogId).toArray()).filter((p) => !p.deletedAt).sort((x, y) => x.createdAt - y.createdAt)
          await db.dogs.update(dog.id, { primaryPhotoId: rest[0]?.id, updatedAt: now })
        }
      })
    },

    async updateDogBreed(dogId, breed) {
      const label = breed.breedId ? undefined : clean(breed.customBreedLabel)
      if (!breed.breedId && !label) throw new Error('A breed is required')
      await db.dogs.update(dogId, {
        breedId: breed.breedId,
        customBreedLabel: label,
        customGroupId: breed.breedId ? undefined : breed.customGroupId || undefined,
        updatedAt: Date.now(),
      })
    },

    async updateCustomBreed(currentLabel, next) {
      const label = clean(next.label)
      if (!label) throw new Error('A breed name is required')
      const now = Date.now()
      return db.transaction('rw', db.dogs, async () => {
        const dogs = (await db.dogs.toArray()).filter((d) => !d.deletedAt && !d.breedId && d.customBreedLabel === currentLabel)
        // Merging into an existing custom breed with the same name adopts its category unless one was chosen.
        for (const d of dogs) await db.dogs.update(d.id, { customBreedLabel: label, customGroupId: next.groupId || undefined, updatedAt: now })
        return dogs.length
      })
    },

    async addSticker(dogId: string, input: StickerInput): Promise<Sticker> {
      if (!isGiphyUrl(input.url) || (input.stillUrl && !isGiphyUrl(input.stillUrl))) throw new Error('That sticker is not from GIPHY')
      const now = Date.now()
      return db.transaction('rw', [db.dogs, db.photos, db.stickers], async () => {
        const dog = await db.dogs.get(dogId)
        if (!dog || dog.deletedAt) throw new Error('Dog not found')
        const photo = await db.photos.get(input.photoId)
        if (!photo || photo.dogId !== dogId || photo.deletedAt) throw new Error('Photo not found')
        const existing = (await db.stickers.where('dogId').equals(dogId).toArray()).filter((s) => !s.deletedAt && s.photoId === input.photoId)
        if (existing.length >= MAX_STICKERS_PER_PHOTO) throw new Error(`A photo can have up to ${MAX_STICKERS_PER_PHOTO} stickers`)
        const sticker: Sticker = {
          id: newId(),
          dogId,
          photoId: input.photoId,
          giphyId: input.giphyId,
          title: clean(input.title),
          url: input.url,
          stillUrl: input.stillUrl,
          width: Math.max(1, Math.round(input.width)),
          height: Math.max(1, Math.round(input.height)),
          x: 0.5,
          y: 0.5,
          scale: 0.35,
          rotation: 0,
          z: existing.reduce((m, s) => Math.max(m, s.z), 0) + 1,
          createdAt: now,
          updatedAt: now,
        }
        await db.stickers.add(sticker)
        return sticker
      })
    },

    async updateSticker(id: string, patch: StickerPatch) {
      const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
      await db.transaction('rw', db.stickers, async () => {
        const s = await db.stickers.get(id)
        if (!s || s.deletedAt) return
        const next: Partial<Sticker> = { updatedAt: Date.now() }
        if (patch.x !== undefined) next.x = clamp(patch.x, 0, 1)
        if (patch.y !== undefined) next.y = clamp(patch.y, 0, 1)
        if (patch.scale !== undefined) next.scale = clamp(patch.scale, 0.05, 1)
        if (patch.rotation !== undefined) next.rotation = clamp(patch.rotation, -360, 360)
        if (patch.toFront) {
          const siblings = (await db.stickers.where('dogId').equals(s.dogId).toArray()).filter((o) => !o.deletedAt)
          next.z = siblings.reduce((m, o) => Math.max(m, o.z), 0) + 1
        }
        await db.stickers.update(id, next)
      })
    },

    async restoreStickers(dogId: string, stickers: Sticker[]) {
      const now = Date.now()
      await db.transaction('rw', db.stickers, async () => {
        const wanted = new Map(stickers.filter((s) => s.dogId === dogId).map((s) => [s.id, s]))
        for (const current of await db.stickers.where('dogId').equals(dogId).toArray()) {
          const want = wanted.get(current.id)
          wanted.delete(current.id)
          if (!want) {
            if (!current.deletedAt) await db.stickers.update(current.id, { deletedAt: now, updatedAt: now }) // added since: remove
            continue
          }
          const unchanged = !current.deletedAt && current.x === want.x && current.y === want.y && current.scale === want.scale && current.rotation === want.rotation && current.z === want.z
          if (!unchanged) await db.stickers.put({ ...want, deletedAt: undefined, updatedAt: now }) // edited or removed since: restore
        }
        for (const want of wanted.values()) await db.stickers.put({ ...want, deletedAt: undefined, updatedAt: now })
      })
    },

    async attachLooseStickers() {
      const now = Date.now()
      return db.transaction('rw', [db.dogs, db.photos, db.stickers], async () => {
        const loose = (await db.stickers.toArray()).filter((s) => !s.deletedAt && !s.photoId)
        let attached = 0
        for (const s of loose) {
          const dog = await db.dogs.get(s.dogId)
          if (!dog || dog.deletedAt) continue
          const photos = (await db.photos.where('dogId').equals(s.dogId).toArray()).filter((p) => !p.deletedAt).sort((a, b) => a.createdAt - b.createdAt)
          const target = photos.find((p) => p.id === dog.primaryPhotoId) ?? photos[0]
          if (!target) continue // no photo yet: it waits, and goes onto the dog's first one
          await db.stickers.update(s.id, { photoId: target.id, updatedAt: now })
          attached++
        }
        return attached
      })
    },

    async removeSticker(id: string) {
      const now = Date.now()
      await db.stickers.update(id, { deletedAt: now, updatedAt: now })
    },

    async deleteDog(id: string) {
      const now = Date.now()
      await db.dogs.update(id, { deletedAt: now, updatedAt: now })
    },

    async awardBadges(badgeIds: string[]) {
      const now = Date.now()
      await db.badgeAwards.bulkPut(badgeIds.map((badgeId) => ({ badgeId, earnedAt: now })))
    },

    async getSettings(): Promise<Settings> {
      const rows = await db.settings.toArray()
      const out: Settings = { ...DEFAULT_SETTINGS }
      for (const r of rows) {
        if (r.key === 'weeklyGoal' && typeof r.value === 'number') out.weeklyGoal = r.value
        if (r.key === 'locationMode' && (r.value === 'auto' || r.value === 'off')) out.locationMode = r.value
        if (r.key === 'identifyPhotos' && typeof r.value === 'boolean') out.identifyPhotos = r.value
        if (r.key === 'quizStats') out.quizStats = readQuizStats(r.value)
      }
      return out
    },

    async setSetting(key, value) {
      await db.settings.put({ key, value, updatedAt: Date.now() })
    },

    async clearAll() {
      await db.transaction(
        'rw',
        [db.dogs, db.encounters, db.photos, db.guesses, db.badgeAwards, db.settings, db.syncMeta, db.stickers],
        async () => {
          await Promise.all([
            db.syncMeta.clear(),
            db.stickers.clear(),
            db.dogs.clear(),
            db.encounters.clear(),
            db.photos.clear(),
            db.guesses.clear(),
            db.badgeAwards.clear(),
            db.settings.clear(),
          ])
        },
      )
    },
  }
}

export { createDb }
export const repo: Repository = createLocalRepo()
