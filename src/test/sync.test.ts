import { beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../storage/db'
import { createLocalRepo } from '../storage/localRepo'
import type { DogdexDB } from '../storage/db'
import { claimDevice, flushAndClear, resetDevice, syncOnce } from '../sync/engine'
import type { RemoteRow, RemoteStore } from '../sync/engine'
import { dogFromRemote, dogToRemote, guessFromRemote, guessToRemote, labelSafe, toIso } from './syncHelpers'

/** In-memory stand-in for Supabase that mimics the server rules: per-table rows, last-write-wins, a pull cursor. */
function fakeStore() {
  const tables = new Map<string, Map<string, RemoteRow>>()
  const files = new Map<string, Blob>()
  let clock = 0
  const keyOf = (table: string, r: Record<string, unknown>) =>
    table === 'badge_awards' ? `${r.user_id}/${r.badge_id}` : table === 'settings' ? `${r.user_id}/${r.key}` : String(r.id)
  const store: RemoteStore & { tables: typeof tables; files: typeof files } = {
    tables,
    files,
    async upsert(table, rows) {
      const t = tables.get(table) ?? new Map<string, RemoteRow>()
      tables.set(table, t)
      for (const row of rows as Record<string, unknown>[]) {
        const k = keyOf(table, row)
        const old = t.get(k)
        if (old && String(row.updated_at) < String(old.updated_at)) continue // server-side last write wins
        if (old && row.updated_at === old.updated_at) {
          t.set(k, { ...row, server_updated_at: old.server_updated_at })
          continue
        }
        // distinct, increasing, sortable timestamps, like clock_timestamp()
        t.set(k, { ...row, server_updated_at: new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString() })
      }
    },
    async fetchSince(table, cursor, limit) {
      return [...(tables.get(table)?.values() ?? [])]
        .filter((r) => r.server_updated_at > cursor)
        .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
        .slice(0, limit)
    },
    async uploadPhoto(path, blob) {
      files.set(path, blob)
    },
    async removePhotos(paths) {
      for (const p of paths) files.delete(p)
    },
    async downloadPhoto(path) {
      const b = files.get(path)
      if (!b) throw new Error('missing file')
      return b
    },
  }
  return store
}

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
let n = 0
let dbA: DogdexDB
let dbB: DogdexDB
let a: ReturnType<typeof createLocalRepo>
let b: ReturnType<typeof createLocalRepo>
beforeEach(() => {
  dbA = createDb(`sync-a-${n}`)
  dbB = createDb(`sync-b-${n++}`)
  a = createLocalRepo(dbA)
  b = createLocalRepo(dbB)
})
const photo = { blob: new Blob(['full-bytes'], { type: 'image/jpeg' }), thumb: new Blob(['thumb-bytes'], { type: 'image/jpeg' }), width: 10, height: 8 }

describe('record mapping', () => {
  it('round-trips dogs and guesses without losing anything', async () => {
    const { dog } = await a.logSighting({ breedId: null, customBreedLabel: 'Staffordshire Bull Terrier', name: 'Creed', metAt: 1_700_000_000_123 })
    await a.updateCustomBreed('Staffordshire Bull Terrier', { label: 'Staffordshire Bull Terrier', groupId: 'terrier' })
    const stored = (await a.getSnapshot()).dogs[0]
    expect(dogFromRemote(dogToRemote(stored, USER))).toEqual({ ...stored, userId: USER, deletedAt: undefined, primaryPhotoId: undefined, ownerName: undefined, note: undefined })
    expect(dogToRemote(stored, USER).first_met_at).toBe(toIso(dog.firstMetAt))
    const g = {
      id: 'g', encounterId: 'e', dogId: 'd', photoId: undefined, guessedBreedId: 'beagle', suggestions: [{ breedId: 'beagle', confidence: 0.5 }],
      confirmedBreedId: 'beagle', correct: true, identifierId: 'mock-v1', createdAt: 5, updatedAt: 6,
    }
    expect(guessFromRemote(guessToRemote(g, USER))).toEqual({ ...g, userId: USER, deletedAt: undefined })
  })
  it('never sends raw coordinates, only the rounded cell', () => {
    expect(labelSafe()).toBe(true)
  })
})

describe('sync engine', () => {
  it('uploads local data (including photos) and a second device receives it', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'rhodesian-ridgeback', name: 'Raffie', ownerName: 'Jen', metAt: 1000, placeLabel: 'Tribeca', geoCell: '40.72,-74.01', photo,
      guess: { guessedBreedId: 'beagle', suggestions: [{ breedId: 'beagle', confidence: 0.6 }], identifierId: 'mock-v1' } })
    await a.setSetting('weeklyGoal', 8)
    const { awarded } = { awarded: await a.awardBadges(['first-dog']) }
    void awarded

    const first = await syncOnce(dbA, remote, USER)
    expect(first.pushed).toBeGreaterThanOrEqual(6)
    expect(remote.files.size).toBe(2) // full + thumbnail
    expect([...remote.files.keys()].every((k) => k.startsWith(`${USER}/`))).toBe(true)

    await syncOnce(dbB, remote, USER)
    const snap = await b.getSnapshot()
    expect(snap.dogs).toHaveLength(1)
    expect(snap.dogs[0]).toMatchObject({ id: dog.id, name: 'Raffie', ownerName: 'Jen', breedId: 'rhodesian-ridgeback' })
    expect(snap.encounters[0]).toMatchObject({ placeLabel: 'Tribeca', geoCell: '40.72,-74.01' })
    expect(snap.guesses[0]).toMatchObject({ guessedBreedId: 'beagle', correct: false })
    expect(snap.awards.map((x) => x.badgeId)).toEqual(['first-dog'])
    expect((await b.getSettings()).weeklyGoal).toBe(8)
    // (fake-indexeddb under jsdom can't hand Blobs back with their methods, so check the record, not the bytes)
    const p = (await dbB.photos.toArray())[0]
    expect(p).toMatchObject({ id: snap.dogs[0].primaryPhotoId, dogId: dog.id, width: 10, height: 8 })
    expect(p.blob).toBeDefined()
    expect(p.thumb).toBeDefined()
  })

  it('is idempotent: a second sync with nothing new does no work', async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', metAt: 1 })
    await syncOnce(dbA, remote, USER)
    expect(await syncOnce(dbA, remote, USER)).toEqual({ pushed: 0, pulled: 0 })
  })

  it('syncs edits, repeat encounters and deletes between devices', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'beagle', name: 'Old', metAt: 1000 })
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)

    await new Promise((r) => setTimeout(r, 5))
    await b.updateDog(dog.id, { name: 'New' })
    await b.addEncounter(dog.id, { metAt: 5000 })
    await syncOnce(dbB, remote, USER)
    await syncOnce(dbA, remote, USER)
    let snap = await a.getSnapshot()
    expect(snap.dogs[0].name).toBe('New')
    expect(snap.dogs[0].lastMetAt).toBe(5000)
    expect(snap.encounters).toHaveLength(2)

    await new Promise((r) => setTimeout(r, 5))
    await a.deleteDog(dog.id)
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)
    snap = await b.getSnapshot()
    expect(snap.dogs).toHaveLength(0)
    expect(snap.encounters).toHaveLength(0)
  })

  it('resolves conflicting edits by last write wins', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'beagle', name: 'Start', metAt: 1 })
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)

    await new Promise((r) => setTimeout(r, 5))
    await a.updateDog(dog.id, { name: 'From A (earlier)' })
    await new Promise((r) => setTimeout(r, 5))
    await b.updateDog(dog.id, { name: 'From B (later)' })
    // B syncs first, then A pushes an older edit: the server keeps B's.
    await syncOnce(dbB, remote, USER)
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)
    expect((await a.getSnapshot()).dogs[0].name).toBe('From B (later)')
    expect((await b.getSnapshot()).dogs[0].name).toBe('From B (later)')
  })

  it('merges two devices that each logged different dogs offline', async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', metAt: 1 })
    await b.logSighting({ breedId: 'dachshund', metAt: 2 })
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)
    await syncOnce(dbA, remote, USER)
    expect((await a.getSnapshot()).dogs.map((d) => d.breedId).sort()).toEqual(['beagle', 'dachshund'])
    expect((await b.getSnapshot()).dogs).toHaveLength(2)
  })

  it('does not advance past a photo that failed to download, so it retries', async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', metAt: 1, photo })
    await syncOnce(dbA, remote, USER)
    const good = remote.downloadPhoto
    remote.downloadPhoto = async () => {
      throw new Error('network')
    }
    await expect(syncOnce(dbB, remote, USER)).rejects.toThrow('network')
    expect(await dbB.photos.count()).toBe(0)
    remote.downloadPhoto = good
    await syncOnce(dbB, remote, USER)
    expect(await dbB.photos.count()).toBe(1)
  })
})

describe('device ownership', () => {
  it('adopts existing local data on first sign-in, and recognizes the same account later', async () => {
    await a.logSighting({ breedId: 'beagle', metAt: 1 })
    expect(await claimDevice(dbA, USER)).toBe('claimed')
    expect(await claimDevice(dbA, USER)).toBe('same')
    expect((await a.getSnapshot()).dogs).toHaveLength(1) // not wiped
  })
  it('refuses to mix another account, and a reset starts clean', async () => {
    await a.logSighting({ breedId: 'beagle', metAt: 1 })
    await claimDevice(dbA, USER)
    expect(await claimDevice(dbA, OTHER)).toBe('other')
    await resetDevice(dbA, OTHER)
    expect((await a.getSnapshot()).dogs).toHaveLength(0)
    expect(await claimDevice(dbA, OTHER)).toBe('same')
  })
})

describe('signing out', () => {
  it('backs up first, then removes the collection from the device; signing back in restores it', async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', name: 'Before sign-in', metAt: 1, photo }) // logged while signed out, then adopted
    await claimDevice(dbA, USER)
    expect(await flushAndClear(dbA, remote, USER)).toBe('cleared')

    const snap = await a.getSnapshot()
    expect(snap.dogs).toHaveLength(0)
    expect(snap.encounters).toHaveLength(0)
    expect(await dbA.photos.count()).toBe(0)
    expect(await dbA.syncMeta.count()).toBe(0)

    // The cloud still has it, so the next sign-in brings it back.
    await claimDevice(dbA, USER)
    await syncOnce(dbA, remote, USER)
    expect((await a.getSnapshot()).dogs.map((d) => d.name)).toEqual(['Before sign-in'])
    expect(await dbA.photos.count()).toBe(1)
  })

  it('does not remove anything if the final backup fails, unless forced', async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', metAt: 1 })
    await claimDevice(dbA, USER)
    const upsert = remote.upsert
    remote.upsert = async () => {
      throw new Error('offline')
    }
    expect(await flushAndClear(dbA, remote, USER)).toBe('unsynced')
    expect((await a.getSnapshot()).dogs).toHaveLength(1)

    expect(await flushAndClear(dbA, remote, USER, true)).toBe('cleared')
    expect((await a.getSnapshot()).dogs).toHaveLength(0)
    remote.upsert = upsert
  })

  it("never shows one account's collection to the next person on the device", async () => {
    const remote = fakeStore()
    await a.logSighting({ breedId: 'beagle', name: 'Mine', metAt: 1 })
    await claimDevice(dbA, USER)
    await flushAndClear(dbA, remote, USER)
    expect(await claimDevice(dbA, OTHER)).toBe('claimed') // clean slate, no "different account" prompt
    // The real database only returns a user's own rows (row-level security); mimic that for the second account.
    const asOther: RemoteStore = { ...remote, fetchSince: async (t, c, l) => (await remote.fetchSince(t, c, l)).filter((r) => r.user_id === OTHER) }
    await syncOnce(dbA, asOther, OTHER)
    expect((await a.getSnapshot()).dogs).toHaveLength(0)
  })
})

describe('deleting photos', () => {
  const pic = (t: string) => ({ blob: new Blob([t], { type: 'image/jpeg' }), thumb: new Blob([t], { type: 'image/jpeg' }), width: 4, height: 3 })

  it('removes the files from the cloud, and the photo disappears on the other device', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'beagle', metAt: 1 })
    const p1 = await a.addDogPhoto(dog.id, pic('one'))
    const p2 = await a.addDogPhoto(dog.id, pic('two'))
    await claimDevice(dbA, USER)
    await syncOnce(dbA, remote, USER)
    expect(remote.files.size).toBe(4) // two photos, each with a thumbnail
    await syncOnce(dbB, remote, USER)
    expect(await dbB.photos.count()).toBe(2)

    await new Promise((r) => setTimeout(r, 5))
    await a.deletePhoto(p2.id)
    await syncOnce(dbA, remote, USER)
    expect(remote.files.size).toBe(2)
    expect([...remote.files.keys()].some((k) => k.includes(p2.id))).toBe(false)
    expect([...remote.files.keys()].every((k) => k.includes(p1.id))).toBe(true)

    await syncOnce(dbB, remote, USER)
    expect((await dbB.photos.toArray()).map((x) => x.id)).toEqual([p1.id])
    expect((await b.getSnapshot()).dogs[0].primaryPhotoId).toBe(p1.id)
  })

  it('does not upload a photo that was deleted before it ever synced', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'beagle', metAt: 1 })
    const p = await a.addDogPhoto(dog.id, pic('gone'))
    await a.deletePhoto(p.id)
    await claimDevice(dbA, USER)
    await syncOnce(dbA, remote, USER)
    expect(remote.files.size).toBe(0)
  })

  it('syncs which photo is the cover', async () => {
    const remote = fakeStore()
    const { dog } = await a.logSighting({ breedId: 'beagle', metAt: 1 })
    await a.addDogPhoto(dog.id, pic('one'))
    const p2 = await a.addDogPhoto(dog.id, pic('two'))
    await claimDevice(dbA, USER)
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)
    await new Promise((r) => setTimeout(r, 5))
    await a.setPrimaryPhoto(dog.id, p2.id)
    await syncOnce(dbA, remote, USER)
    await syncOnce(dbB, remote, USER)
    expect((await b.getSnapshot()).dogs[0].primaryPhotoId).toBe(p2.id)
  })
})
