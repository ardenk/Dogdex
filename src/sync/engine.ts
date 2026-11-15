import type { Table } from 'dexie'
import type { DogdexDB } from '../storage/db'
import type { BadgeAward, Dog, Encounter, Guess, Photo, Setting, Sticker } from '../domain/types'
import {
  awardFromRemote,
  awardToRemote,
  dogFromRemote,
  dogToRemote,
  encounterFromRemote,
  encounterToRemote,
  guessFromRemote,
  guessToRemote,
  photoPaths,
  settingFromRemote,
  settingToRemote,
  stickerFromRemote,
  stickerToRemote,
  toIso,
  toMs,
} from './mappers'
import type { RemoteAward, RemoteDog, RemoteEncounter, RemoteGuess, RemotePhoto, RemoteSetting, RemoteSticker } from './mappers'

/**
 * Local-first sync. IndexedDB stays the source of truth the UI reads; this module copies changes
 * to and from Supabase in the background.
 *
 *  - Push: local rows whose `updatedAt` is newer than the last pushed cursor are upserted.
 *  - Pull: remote rows whose `server_updated_at` is past the last pulled cursor are applied locally.
 *  - Conflicts: last write wins by `updatedAt` (the database enforces the same rule).
 *  - Deletes are soft (`deletedAt`) so they sync like any other edit.
 */

export type RemoteRow = Record<string, unknown> & { server_updated_at: string }

/** The only thing the engine needs from the backend. Real implementation: `supabaseStore`. */
export interface RemoteStore {
  upsert(table: string, rows: object[], onConflict: string): Promise<void>
  fetchSince(table: string, cursor: string, limit: number): Promise<RemoteRow[]>
  uploadPhoto(path: string, blob: Blob): Promise<void>
  downloadPhoto(path: string): Promise<Blob>
  /** Permanently deletes image files (used when a photo is deleted). Missing files are not an error. */
  removePhotos(paths: string[]): Promise<void>
}

export interface SyncResult {
  pushed: number
  pulled: number
}

const PAGE = 500
const EPOCH = '1970-01-01T00:00:00Z'

// ---------- bookkeeping ----------

export async function getMeta(db: DogdexDB, key: string): Promise<string | undefined> {
  return (await db.syncMeta.get(key))?.value
}
const setMeta = (db: DogdexDB, key: string, value: string) => db.syncMeta.put({ key, value })

/**
 * Ties this device's data to one account.
 *  - 'claimed': first sign-in on this device. Existing local data is adopted by the account (uploaded on first sync).
 *  - 'same': the same account as before.
 *  - 'other': a different account last used this device. Ask before mixing data.
 */
export async function claimDevice(db: DogdexDB, userId: string): Promise<'claimed' | 'same' | 'other'> {
  const current = await getMeta(db, 'userId')
  if (!current) {
    await setMeta(db, 'userId', userId)
    return 'claimed'
  }
  return current === userId ? 'same' : 'other'
}

/** Removes every local record and cursor, then assigns the device to `userId`. */
export async function resetDevice(db: DogdexDB, userId?: string): Promise<void> {
  await db.transaction('rw', [db.dogs, db.encounters, db.photos, db.guesses, db.badgeAwards, db.settings, db.syncMeta, db.stickers], async () => {
    await Promise.all([db.stickers.clear(), db.dogs.clear(), db.encounters.clear(), db.photos.clear(), db.guesses.clear(), db.badgeAwards.clear(), db.settings.clear(), db.syncMeta.clear()])
    if (userId) await db.syncMeta.put({ key: 'userId', value: userId })
  })
}

// ---------- table specs ----------

interface Spec<L, R extends object> {
  name: string
  onConflict: string
  table: (db: DogdexDB) => Table<L, string>
  keyOf: (l: L) => string
  updatedAtOf: (l: L) => number
  toRemote: (l: L, userId: string) => R
  fromRemote: (r: R) => L
}

const specs = {
  dogs: {
    name: 'dogs',
    onConflict: 'id',
    table: (db) => db.dogs as Table<Dog, string>,
    keyOf: (d) => d.id,
    updatedAtOf: (d) => d.updatedAt,
    toRemote: dogToRemote,
    fromRemote: dogFromRemote,
  } satisfies Spec<Dog, RemoteDog>,
  stickers: {
    name: 'stickers',
    onConflict: 'id',
    table: (db) => db.stickers as Table<Sticker, string>,
    keyOf: (s) => s.id,
    updatedAtOf: (s) => s.updatedAt,
    toRemote: stickerToRemote,
    fromRemote: stickerFromRemote,
  } satisfies Spec<Sticker, RemoteSticker>,
  encounters: {
    name: 'encounters',
    onConflict: 'id',
    table: (db) => db.encounters as Table<Encounter, string>,
    keyOf: (e) => e.id,
    updatedAtOf: (e) => e.updatedAt,
    toRemote: encounterToRemote,
    fromRemote: encounterFromRemote,
  } satisfies Spec<Encounter, RemoteEncounter>,
  guesses: {
    name: 'guesses',
    onConflict: 'id',
    table: (db) => db.guesses as Table<Guess, string>,
    keyOf: (g) => g.id,
    updatedAtOf: (g) => g.updatedAt,
    toRemote: guessToRemote,
    fromRemote: guessFromRemote,
  } satisfies Spec<Guess, RemoteGuess>,
  badge_awards: {
    name: 'badge_awards',
    onConflict: 'user_id,badge_id',
    table: (db) => db.badgeAwards as Table<BadgeAward, string>,
    keyOf: (a) => a.badgeId,
    updatedAtOf: (a) => a.earnedAt,
    toRemote: awardToRemote,
    fromRemote: awardFromRemote,
  } satisfies Spec<BadgeAward, RemoteAward>,
  settings: {
    name: 'settings',
    onConflict: 'user_id,key',
    table: (db) => db.settings as Table<Setting, string>,
    keyOf: (s) => s.key,
    updatedAtOf: (s) => s.updatedAt ?? 0,
    toRemote: settingToRemote,
    fromRemote: settingFromRemote,
  } satisfies Spec<Setting, RemoteSetting>,
}

/** Remote columns the photo table keeps; the image bytes themselves live in Storage. */
const PHOTO_TABLE = 'photos'

// ---------- push ----------

async function pushSpec<L, R extends object>(db: DogdexDB, store: RemoteStore, userId: string, spec: Spec<L, R>): Promise<number> {
  const cursorKey = `push:${spec.name}`
  const cursor = Number((await getMeta(db, cursorKey)) ?? 0)
  const pending = (await spec.table(db).toArray()).filter((l) => spec.updatedAtOf(l) > cursor).sort((a, b) => spec.updatedAtOf(a) - spec.updatedAtOf(b))
  let pushed = 0
  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100)
    await store.upsert(spec.name, chunk.map((l) => spec.toRemote(l, userId)), spec.onConflict)
    pushed += chunk.length
    await setMeta(db, cursorKey, String(spec.updatedAtOf(chunk[chunk.length - 1])))
  }
  return pushed
}

async function pushPhotos(db: DogdexDB, store: RemoteStore, userId: string): Promise<number> {
  const cursorKey = `push:${PHOTO_TABLE}`
  const cursor = Number((await getMeta(db, cursorKey)) ?? 0)
  const pending = (await db.photos.toArray()).filter((p) => p.updatedAt > cursor).sort((a, b) => a.updatedAt - b.updatedAt)
  for (const p of pending) {
    const paths = photoPaths(userId, p.id)
    if (p.deletedAt) {
      // Deleted on this device: remove the files from the cloud too, then record the deletion below.
      await store.removePhotos([paths.storage_path, paths.thumb_path])
    } else {
      // Bytes first, row second: a photo row never points at a missing file.
      await store.uploadPhoto(paths.storage_path, p.blob)
      await store.uploadPhoto(paths.thumb_path, p.thumb)
    }
    const row: Omit<RemotePhoto, never> = {
      id: p.id,
      user_id: userId,
      dog_id: p.dogId,
      ...paths,
      width: p.width,
      height: p.height,
      focus_x: p.focusX ?? null,
      focus_y: p.focusY ?? null,
      created_at: toIso(p.createdAt),
      updated_at: toIso(p.updatedAt),
      deleted_at: p.deletedAt ? toIso(p.deletedAt) : null,
    }
    await store.upsert(PHOTO_TABLE, [row], 'id')
    await setMeta(db, cursorKey, String(p.updatedAt))
  }
  return pending.length
}

// ---------- pull ----------

async function pullSpec<L, R extends object>(db: DogdexDB, store: RemoteStore, spec: Spec<L, R>): Promise<number> {
  const cursorKey = `pull:${spec.name}`
  let cursor = (await getMeta(db, cursorKey)) ?? EPOCH
  let applied = 0
  for (;;) {
    const rows = await store.fetchSince(spec.name, cursor, PAGE)
    if (rows.length === 0) break
    const incoming = rows.map((r) => spec.fromRemote(r as unknown as R))
    await db.transaction('rw', spec.table(db), async () => {
      const existing = await spec.table(db).bulkGet(incoming.map(spec.keyOf))
      const toWrite = incoming.filter((inc, i) => !existing[i] || spec.updatedAtOf(inc) > spec.updatedAtOf(existing[i]!))
      if (toWrite.length) await spec.table(db).bulkPut(toWrite)
      applied += toWrite.length
    })
    cursor = rows[rows.length - 1].server_updated_at
    await setMeta(db, cursorKey, cursor)
    if (rows.length < PAGE) break
  }
  return applied
}

async function pullPhotos(db: DogdexDB, store: RemoteStore): Promise<number> {
  const cursorKey = `pull:${PHOTO_TABLE}`
  let cursor = (await getMeta(db, cursorKey)) ?? EPOCH
  let applied = 0
  for (;;) {
    const rows = (await store.fetchSince(PHOTO_TABLE, cursor, 100)) as unknown as (RemotePhoto & { server_updated_at: string })[]
    if (rows.length === 0) break
    for (const r of rows) {
      const existing = await db.photos.get(r.id)
      const remoteMs = toMs(r.updated_at)
      if (!existing || remoteMs > existing.updatedAt) {
        const focus = r.focus_x != null && r.focus_y != null ? { focusX: r.focus_x, focusY: r.focus_y } : {}
        if (r.deleted_at) {
          await db.photos.delete(r.id)
        } else if (existing && !existing.deletedAt) {
          // Only the framing (or similar) changed: keep the image bytes we already have instead of downloading them again.
          await db.photos.put({ ...existing, focusX: undefined, focusY: undefined, ...focus, width: r.width, height: r.height, updatedAt: remoteMs })
          applied++
        } else {
          // If a download fails we throw before moving the cursor, so the next sync retries this photo.
          const [blob, thumb] = await Promise.all([store.downloadPhoto(r.storage_path), store.downloadPhoto(r.thumb_path)])
          const photo: Photo = { id: r.id, userId: r.user_id, dogId: r.dog_id, blob, thumb, width: r.width, height: r.height, ...focus, createdAt: toMs(r.created_at), updatedAt: remoteMs }
          await db.photos.put(photo)
          applied++
        }
      }
      cursor = r.server_updated_at
      await setMeta(db, cursorKey, cursor)
    }
    if (rows.length < 100) break
  }
  return applied
}

// ---------- public ----------

/**
 * Sign-out support: push everything to the cloud one last time, then remove the account's data from this device.
 * If the final sync fails (for example offline) and `force` is false, nothing is removed and 'unsynced' is returned,
 * so the caller can warn that recent changes would be lost.
 */
export async function flushAndClear(db: DogdexDB, store: RemoteStore, userId: string, force = false): Promise<'cleared' | 'unsynced'> {
  try {
    await syncOnce(db, store, userId)
  } catch {
    if (!force) return 'unsynced'
  }
  await resetDevice(db)
  return 'cleared'
}


/** One full round: push local changes (parents before children), then pull remote changes. */
export async function syncOnce(db: DogdexDB, store: RemoteStore, userId: string): Promise<SyncResult> {
  let pushed = 0
  pushed += await pushSpec(db, store, userId, specs.dogs)
  pushed += await pushPhotos(db, store, userId)
  pushed += await pushSpec(db, store, userId, specs.stickers)
  pushed += await pushSpec(db, store, userId, specs.encounters)
  pushed += await pushSpec(db, store, userId, specs.guesses)
  pushed += await pushSpec(db, store, userId, specs.badge_awards)
  pushed += await pushSpec(db, store, userId, specs.settings)

  let pulled = 0
  pulled += await pullSpec(db, store, specs.dogs)
  pulled += await pullPhotos(db, store)
  pulled += await pullSpec(db, store, specs.stickers)
  pulled += await pullSpec(db, store, specs.encounters)
  pulled += await pullSpec(db, store, specs.guesses)
  pulled += await pullSpec(db, store, specs.badge_awards)
  pulled += await pullSpec(db, store, specs.settings)

  await setMeta(db, 'lastSyncedAt', String(Date.now()))
  return { pushed, pulled }
}
