import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { BadgeAward, Dog, Encounter, Guess, Photo, Setting, Sticker, SyncMeta } from '../domain/types'

export type DogdexDB = Dexie & {
  dogs: EntityTable<Dog, 'id'>
  encounters: EntityTable<Encounter, 'id'>
  photos: EntityTable<Photo, 'id'>
  guesses: EntityTable<Guess, 'id'>
  badgeAwards: EntityTable<BadgeAward, 'badgeId'>
  settings: EntityTable<Setting, 'key'>
  stickers: EntityTable<Sticker, 'id'>
  syncMeta: EntityTable<SyncMeta, 'key'>
}

export function createDb(name = 'dogdex'): DogdexDB {
  const db = new Dexie(name) as DogdexDB
  db.version(1).stores({
    dogs: 'id, breedId, lastMetAt, updatedAt',
    encounters: 'id, dogId, metAt',
    photos: 'id, dogId',
    guesses: 'id, encounterId, dogId',
    badgeAwards: 'badgeId',
    settings: 'key',
  })
  // v2: adds the sync bookkeeping table. Existing data is untouched.
  db.version(2).stores({
    dogs: 'id, breedId, lastMetAt, updatedAt',
    encounters: 'id, dogId, metAt',
    photos: 'id, dogId',
    guesses: 'id, encounterId, dogId',
    badgeAwards: 'badgeId',
    settings: 'key',
    syncMeta: 'key',
  })
  // v3: GIPHY stickers on dogs.
  db.version(3).stores({
    dogs: 'id, breedId, lastMetAt, updatedAt',
    encounters: 'id, dogId, metAt',
    photos: 'id, dogId',
    guesses: 'id, encounterId, dogId',
    badgeAwards: 'badgeId',
    settings: 'key',
    syncMeta: 'key',
    stickers: 'id, dogId',
  })
  return db
}

/** The app's single on-device database. */
export const db = createDb()
