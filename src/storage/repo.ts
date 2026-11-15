import type { Dog, Encounter, Photo, Settings, Snapshot, Sticker, Suggestion } from '../domain/types'

export interface PhotoInput {
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

export interface StickerInput {
  /** The photo to put the sticker on. */
  photoId: string
  giphyId: string
  title?: string
  url: string
  stillUrl?: string
  width: number
  height: number
}

export type StickerPatch = Partial<Pick<Sticker, 'x' | 'y' | 'scale' | 'rotation'>> & { toFront?: boolean }

export interface LogSightingInput {
  /** Pass breedId, or customBreedLabel for a breed that isn't in the dataset. */
  breedId: string | null
  customBreedLabel?: string
  /** Category for a custom breed. */
  customGroupId?: string
  name?: string
  ownerName?: string
  note?: string
  metAt: number
  placeLabel?: string
  geoCell?: string
  photo?: PhotoInput
  guess?: { guessedBreedId: string | null; suggestions: Suggestion[]; identifierId: string }
}

export interface LogSightingResult {
  dog: Dog
  encounter: Encounter
  /** True the first time this breed enters the user's Dogdex. */
  isNewBreed: boolean
}

export interface EncounterInput {
  metAt: number
  placeLabel?: string
  geoCell?: string
  note?: string
}

/**
 * The seam between the UI and wherever data lives.
 * `localRepo` (IndexedDB) implements it today; a `supabaseRepo` can implement it later without touching screens.
 */
export interface Repository {
  getSnapshot(): Promise<Snapshot>
  logSighting(input: LogSightingInput): Promise<LogSightingResult>
  addEncounter(dogId: string, input: EncounterInput): Promise<Encounter>
  updateDog(id: string, patch: Partial<Pick<Dog, 'name' | 'ownerName' | 'note'>>): Promise<void>
  /** Adds a photo to a dog. The first photo (or the first after the cover was deleted) becomes the cover. Throws past MAX_PHOTOS_PER_DOG. */
  addDogPhoto(dogId: string, photo: PhotoInput): Promise<Photo>
  /** Chooses which of the dog's photos is its cover: shown on tiles, lists and share cards, and the home of its stickers. */
  setPrimaryPhoto(dogId: string, photoId: string): Promise<void>
  /** Sets where the dog is in a photo, so crops keep it in view (fractions 0–1 of the photo's width and height). Syncs like any photo change. */
  setPhotoFocus(photoId: string, focus: { x: number; y: number }): Promise<void>
  /** Deletes a photo's image data (a small record stays so the deletion can sync). If it was the cover, the next photo takes over. */
  deletePhoto(photoId: string): Promise<void>
  /** Changes which breed a dog is, to a listed breed or a custom one (optionally filed under a category). */
  updateDogBreed(dogId: string, breed: { breedId: string | null; customBreedLabel?: string; customGroupId?: string }): Promise<void>
  /** Renames a custom breed and/or files it under a group, for every dog logged with it. Returns how many dogs changed. */
  updateCustomBreed(currentLabel: string, next: { label: string; groupId?: string }): Promise<number>
  /** Adds a sticker at the center of a photo. Throws for a photo that isn't this dog's, past MAX_STICKERS_PER_PHOTO, or for non-GIPHY URLs. */
  addSticker(dogId: string, input: StickerInput): Promise<Sticker>
  updateSticker(id: string, patch: StickerPatch): Promise<void>
  removeSticker(id: string): Promise<void>
  /**
   * Puts a dog's stickers back exactly as `stickers` has them: edits are undone, stickers added since are removed,
   * and stickers removed since come back. Used by Cancel on the sticker controls.
   */
  restoreStickers(dogId: string, stickers: Sticker[]): Promise<void>
  /**
   * Attaches stickers that predate "a sticker belongs to one photo" to their dog's cover photo (the photo they were showing on).
   * Safe to repeat; returns how many it attached.
   */
  attachLooseStickers(): Promise<number>
  deleteDog(id: string): Promise<void>
  awardBadges(badgeIds: string[]): Promise<void>
  getSettings(): Promise<Settings>
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  clearAll(): Promise<void>
}
