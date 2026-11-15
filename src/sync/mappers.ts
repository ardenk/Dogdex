import type { BadgeAward, Dog, Encounter, Guess, Setting, Sticker, Suggestion } from '../domain/types'

/**
 * Local records use epoch milliseconds and camelCase; Postgres uses timestamptz and snake_case.
 * Every function here is a pure conversion so the rules live in one place and are easy to test.
 */
export const toIso = (ms: number): string => new Date(ms).toISOString()
export const toMs = (iso: string): number => new Date(iso).getTime()
const toIsoOrNull = (ms?: number | null): string | null => (ms == null ? null : toIso(ms))
const toMsOrUndefined = (iso?: string | null): number | undefined => (iso ? toMs(iso) : undefined)
const nullable = <T>(v: T | undefined): T | null => (v === undefined ? null : v)
const undef = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v)

// Remote row shapes (only the columns the client reads or writes).
export interface RemoteDog {
  id: string
  user_id: string
  breed_id: string | null
  custom_breed_label: string | null
  custom_group_id: string | null
  name: string | null
  owner_name: string | null
  note: string | null
  primary_photo_id: string | null
  first_met_at: string
  last_met_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemoteEncounter {
  id: string
  user_id: string
  dog_id: string
  met_at: string
  place_label: string | null
  geo_cell: string | null
  note: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemotePhoto {
  id: string
  user_id: string
  dog_id: string
  storage_path: string
  thumb_path: string
  width: number
  height: number
  /** Where the dog is in the photo (fractions of width/height); null = centered. */
  focus_x?: number | null
  focus_y?: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemoteGuess {
  id: string
  user_id: string
  encounter_id: string
  dog_id: string
  photo_id: string | null
  guessed_breed_id: string | null
  suggestions: Suggestion[]
  confirmed_breed_id: string | null
  correct: boolean | null
  identifier_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemoteSticker {
  id: string
  user_id: string
  dog_id: string
  photo_id?: string | null
  giphy_id: string
  title: string | null
  url: string
  still_url: string | null
  width: number
  height: number
  x: number
  y: number
  scale: number
  rotation: number
  z: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemoteAward {
  user_id: string
  badge_id: string
  earned_at: string
  updated_at: string
  deleted_at: string | null
}
export interface RemoteSetting {
  user_id: string
  key: string
  value: unknown
  updated_at: string
  deleted_at: string | null
}

export const dogToRemote = (d: Dog, userId: string): Omit<RemoteDog, never> => ({
  id: d.id,
  user_id: userId,
  breed_id: nullable(d.breedId),
  custom_breed_label: nullable(d.customBreedLabel),
  custom_group_id: nullable(d.customGroupId),
  name: nullable(d.name),
  owner_name: nullable(d.ownerName),
  note: nullable(d.note),
  primary_photo_id: nullable(d.primaryPhotoId),
  first_met_at: toIso(d.firstMetAt),
  last_met_at: toIso(d.lastMetAt),
  created_at: toIso(d.createdAt),
  updated_at: toIso(d.updatedAt),
  deleted_at: toIsoOrNull(d.deletedAt),
})

export const dogFromRemote = (r: RemoteDog): Dog => ({
  id: r.id,
  userId: r.user_id,
  breedId: r.breed_id,
  customBreedLabel: undef(r.custom_breed_label),
  customGroupId: undef(r.custom_group_id),
  name: undef(r.name),
  ownerName: undef(r.owner_name),
  note: undef(r.note),
  primaryPhotoId: undef(r.primary_photo_id),
  firstMetAt: toMs(r.first_met_at),
  lastMetAt: toMs(r.last_met_at),
  createdAt: toMs(r.created_at),
  updatedAt: toMs(r.updated_at),
  deletedAt: toMsOrUndefined(r.deleted_at),
})

export const encounterToRemote = (e: Encounter, userId: string): RemoteEncounter => ({
  id: e.id,
  user_id: userId,
  dog_id: e.dogId,
  met_at: toIso(e.metAt),
  place_label: nullable(e.placeLabel),
  geo_cell: nullable(e.geoCell),
  note: nullable(e.note),
  created_at: toIso(e.createdAt),
  updated_at: toIso(e.updatedAt),
  deleted_at: toIsoOrNull(e.deletedAt),
})

export const encounterFromRemote = (r: RemoteEncounter): Encounter => ({
  id: r.id,
  userId: r.user_id,
  dogId: r.dog_id,
  metAt: toMs(r.met_at),
  placeLabel: undef(r.place_label),
  geoCell: undef(r.geo_cell),
  note: undef(r.note),
  createdAt: toMs(r.created_at),
  updatedAt: toMs(r.updated_at),
  deletedAt: toMsOrUndefined(r.deleted_at),
})

export const guessToRemote = (g: Guess, userId: string): RemoteGuess => ({
  id: g.id,
  user_id: userId,
  encounter_id: g.encounterId,
  dog_id: g.dogId,
  photo_id: nullable(g.photoId),
  guessed_breed_id: g.guessedBreedId,
  suggestions: g.suggestions,
  confirmed_breed_id: g.confirmedBreedId,
  correct: g.correct,
  identifier_id: g.identifierId,
  created_at: toIso(g.createdAt),
  updated_at: toIso(g.updatedAt),
  deleted_at: toIsoOrNull(g.deletedAt),
})

export const guessFromRemote = (r: RemoteGuess): Guess => ({
  id: r.id,
  userId: r.user_id,
  encounterId: r.encounter_id,
  dogId: r.dog_id,
  photoId: undef(r.photo_id),
  guessedBreedId: r.guessed_breed_id,
  suggestions: r.suggestions ?? [],
  confirmedBreedId: r.confirmed_breed_id,
  correct: r.correct,
  identifierId: r.identifier_id,
  createdAt: toMs(r.created_at),
  updatedAt: toMs(r.updated_at),
  deletedAt: toMsOrUndefined(r.deleted_at),
})

export const stickerToRemote = (s: Sticker, userId: string): RemoteSticker => ({
  id: s.id,
  user_id: userId,
  dog_id: s.dogId,
  photo_id: nullable(s.photoId),
  giphy_id: s.giphyId,
  title: nullable(s.title),
  url: s.url,
  still_url: nullable(s.stillUrl),
  width: s.width,
  height: s.height,
  x: s.x,
  y: s.y,
  scale: s.scale,
  rotation: s.rotation,
  z: s.z,
  created_at: toIso(s.createdAt),
  updated_at: toIso(s.updatedAt),
  deleted_at: toIsoOrNull(s.deletedAt),
})

export const stickerFromRemote = (r: RemoteSticker): Sticker => ({
  id: r.id,
  userId: r.user_id,
  dogId: r.dog_id,
  photoId: undef(r.photo_id),
  giphyId: r.giphy_id,
  title: undef(r.title),
  url: r.url,
  stillUrl: undef(r.still_url),
  width: r.width,
  height: r.height,
  x: r.x,
  y: r.y,
  scale: r.scale,
  rotation: r.rotation,
  z: r.z,
  createdAt: toMs(r.created_at),
  updatedAt: toMs(r.updated_at),
  deletedAt: toMsOrUndefined(r.deleted_at),
})

/** Awards never change after they're earned, so earnedAt doubles as the update time. */
export const awardToRemote = (a: BadgeAward, userId: string): RemoteAward => ({
  user_id: userId,
  badge_id: a.badgeId,
  earned_at: toIso(a.earnedAt),
  updated_at: toIso(a.earnedAt),
  deleted_at: null,
})
export const awardFromRemote = (r: RemoteAward): BadgeAward => ({ badgeId: r.badge_id, earnedAt: toMs(r.earned_at) })

export const settingToRemote = (s: Setting, userId: string): RemoteSetting => ({
  user_id: userId,
  key: s.key,
  value: s.value ?? null,
  updated_at: toIso(s.updatedAt ?? 0),
  deleted_at: null,
})
export const settingFromRemote = (r: RemoteSetting): Setting => ({ key: r.key, value: r.value, updatedAt: toMs(r.updated_at) })

export const photoPaths = (userId: string, photoId: string) => ({
  storage_path: `${userId}/${photoId}.jpg`,
  thumb_path: `${userId}/${photoId}_thumb.jpg`,
})
