/**
 * Core records. These map 1:1 onto future Supabase tables:
 * UUID primary keys generated on the client, epoch-millisecond timestamps (→ timestamptz),
 * soft deletes via `deletedAt`, and a nullable `userId` that stays null until accounts exist.
 */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
  userId?: string | null
}

export interface Dog extends BaseRecord {
  /** A breed id from breeds.json, or null when `customBreedLabel` is used. */
  breedId: string | null
  /** Free-text breed for breeds that aren't in the dataset yet. */
  customBreedLabel?: string
  /** AKC group (or "mixed") a custom breed is filed under. Unset = "Other breeds". */
  customGroupId?: string
  name?: string
  ownerName?: string
  note?: string
  primaryPhotoId?: string
  firstMetAt: number
  lastMetAt: number
}

export interface Encounter extends BaseRecord {
  dogId: string
  metAt: number
  /** Neighborhood-level label such as "Tribeca, New York". Never an address. */
  placeLabel?: string
  /** Latitude/longitude rounded to ~1 km, as "40.72,-74.01". Raw coordinates are never stored. */
  geoCell?: string
  note?: string
}

export interface Photo extends BaseRecord {
  dogId: string
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

export interface Suggestion {
  breedId: string
  confidence: number
}

export interface Guess extends BaseRecord {
  encounterId: string
  dogId: string
  photoId?: string
  /** null when the user skipped guessing and went straight to suggestions. */
  guessedBreedId: string | null
  suggestions: Suggestion[]
  confirmedBreedId: string | null
  /** null when no guess was made. */
  correct: boolean | null
  identifierId: string
}

/** An animated GIPHY sticker placed on a dog's photo box. Only a reference is stored, never the image itself. */
export interface Sticker extends BaseRecord {
  dogId: string
  giphyId: string
  title?: string
  /** Animated image on GIPHY's CDN. */
  url: string
  /** A single-frame version, shown to people who prefer reduced motion. */
  stillUrl?: string
  width: number
  height: number
  /** Center of the sticker as a fraction (0–1) of the photo box. */
  x: number
  y: number
  /** Sticker width as a fraction (0.05–1) of the photo box width. */
  scale: number
  /** Degrees, -360 to 360. */
  rotation: number
  /** Stacking order; higher is in front. */
  z: number
}

export const MAX_STICKERS_PER_DOG = 8
export const MAX_PHOTOS_PER_DOG = 12

export interface BadgeAward {
  badgeId: string
  earnedAt: number
}

export interface Setting {
  key: string
  value: unknown
  /** Epoch ms; used to resolve conflicts when syncing. */
  updatedAt?: number
}

/** Bookkeeping for cloud sync (cursors, which account this device belongs to). Never synced itself. */
export interface SyncMeta {
  key: string
  value: string
}

/** Everything the pure logic needs, with deleted rows already filtered out. */
export interface Snapshot {
  dogs: Dog[]
  encounters: Encounter[]
  guesses: Guess[]
  awards: BadgeAward[]
  stickers: Sticker[]
}

export interface Settings {
  weeklyGoal: number
  locationMode: 'auto' | 'off'
}

export const DEFAULT_SETTINGS: Settings = {
  weeklyGoal: 5,
  locationMode: 'auto',
}
