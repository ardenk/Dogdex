import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_STICKERS_PER_PHOTO } from '../domain/types'
import { parseStickerResponse } from '../services/giphy'
import { isGiphyUrl } from '../services/giphy/validate'
import { createDb } from '../storage/db'
import type { DogdexDB } from '../storage/db'
import { createLocalRepo } from '../storage/localRepo'
import { claimDevice, syncOnce } from '../sync/engine'
import type { RemoteRow, RemoteStore } from '../sync/engine'

const GIF = 'https://media2.giphy.com/media/abc123/200w.webp'
const STILL = 'https://media2.giphy.com/media/abc123/200w_s.gif'
const sticker = { giphyId: 'abc123', title: 'Happy dog', url: GIF, stillUrl: STILL, width: 200, height: 150 }

describe('GIPHY URL safety', () => {
  it('accepts only https GIPHY hosts', () => {
    expect(isGiphyUrl(GIF)).toBe(true)
    expect(isGiphyUrl('https://giphy.com/x.gif')).toBe(true)
    expect(isGiphyUrl('http://media.giphy.com/x.gif')).toBe(false)
    expect(isGiphyUrl('https://evil.example/giphy.com/x.gif')).toBe(false)
    expect(isGiphyUrl('https://giphy.com.evil.example/x.gif')).toBe(false)
    expect(isGiphyUrl('https://notgiphy.com/x.gif')).toBe(false)
    expect(isGiphyUrl('javascript:alert(1)')).toBe(false)
    expect(isGiphyUrl('')).toBe(false)
    expect(isGiphyUrl(undefined)).toBe(false)
  })
})

describe('GIPHY response parsing', () => {
  const body = {
    data: [
      { id: 'a1', title: ' Dog Party Sticker ', images: { fixed_width: { url: 'https://media1.giphy.com/media/a1/200w.gif', webp: 'https://media1.giphy.com/media/a1/200w.webp', width: '200', height: '160' }, fixed_width_still: { url: 'https://media1.giphy.com/media/a1/200w_s.gif' } } },
      { id: 'bad', title: 'Tracker', images: { fixed_width: { url: 'https://tracker.example/pixel.gif', width: '10', height: '10' } } },
      { id: 'none', title: 'No image', images: {} },
      { id: 'a2', title: '', images: { fixed_width: { url: 'https://media3.giphy.com/media/a2/200w.gif', width: '200', height: '200' } } },
    ],
    pagination: { total_count: 100, count: 4, offset: 0 },
  }
  it('keeps usable GIPHY stickers, prefers webp, and drops everything else', () => {
    const page = parseStickerResponse(body)
    expect(page.stickers.map((s) => s.giphyId)).toEqual(['a1', 'a2'])
    expect(page.stickers[0]).toMatchObject({ title: 'Dog Party Sticker', url: 'https://media1.giphy.com/media/a1/200w.webp', stillUrl: 'https://media1.giphy.com/media/a1/200w_s.gif', width: 200, height: 160 })
    expect(page.stickers[1]).toMatchObject({ title: 'Sticker', stillUrl: undefined })
  })
  it('computes the next page offset, and stops at the end', () => {
    expect(parseStickerResponse(body).nextOffset).toBe(4)
    expect(parseStickerResponse({ ...body, pagination: { total_count: 4, count: 4, offset: 0 } }).nextOffset).toBeNull()
  })
  it('rejects malformed bodies', () => {
    expect(() => parseStickerResponse({ nope: true })).toThrow()
  })
  // The service imports the Supabase client when it loads, so load a fresh copy with the client we want.
  const loadGiphy = async (client: unknown) => {
    vi.resetModules()
    vi.doMock('../sync/client', () => ({ supabase: client, cloudEnabled: client !== null, openedFromRecoveryLink: false }))
    const [giphy, sb] = await Promise.all([import('../services/giphy'), import('@supabase/supabase-js')])
    return { giphy, sb }
  }
  afterEach(() => {
    vi.doUnmock('../sync/client')
  })

  it('says stickers are not set up when there is no cloud connection', async () => {
    const { giphy } = await loadGiphy(null)
    expect(giphy.giphyEnabled).toBe(false)
    await expect(giphy.searchStickers('dog')).rejects.toMatchObject({ kind: 'not-configured' })
  })

  it('asks the server function (never GIPHY directly), trims the query, and parses the answer', async () => {
    const invoke = vi.fn(async () => ({ data: body, error: null }))
    const { giphy } = await loadGiphy({ functions: { invoke } })
    const page = await giphy.searchStickers('  ' + 'x'.repeat(80) + '  ', 24)
    expect(page.stickers).toHaveLength(2)
    expect(invoke).toHaveBeenCalledWith('giphy', { body: { kind: 'search', query: 'x'.repeat(50), offset: 24 }, signal: undefined })
    await giphy.trendingStickers(48)
    expect(invoke).toHaveBeenLastCalledWith('giphy', { body: { kind: 'trending', offset: 48 }, signal: undefined })
  })

  it('turns sign-in, rate limit, outage and network problems into friendly errors', async () => {
    const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : {}), { status })
    const fail = async (make: (sb: typeof import('@supabase/supabase-js')) => unknown) => {
      const holder: { sb?: typeof import('@supabase/supabase-js') } = {}
      const invoke = vi.fn(async () => ({ data: null, error: make(holder.sb!) }))
      const { giphy, sb } = await loadGiphy({ functions: { invoke } })
      holder.sb = sb
      return giphy.trendingStickers()
    }
    await expect(fail((sb) => new sb.FunctionsHttpError(reply(401, 'sign-in-required')))).rejects.toMatchObject({ kind: 'sign-in-required' })
    await expect(fail((sb) => new sb.FunctionsHttpError(reply(401)))).rejects.toMatchObject({ kind: 'sign-in-required' })
    await expect(fail((sb) => new sb.FunctionsHttpError(reply(429, 'rate-limited')))).rejects.toMatchObject({ kind: 'rate-limited' })
    await expect(fail((sb) => new sb.FunctionsHttpError(reply(500, 'not-configured')))).rejects.toMatchObject({ kind: 'not-configured' })
    await expect(fail((sb) => new sb.FunctionsHttpError(reply(502, 'upstream-error')))).rejects.toMatchObject({ kind: 'other' })
    await expect(fail((sb) => new sb.FunctionsFetchError(new TypeError('Failed to fetch')))).rejects.toMatchObject({ kind: 'network' })
  })

  it('never lets a response with non-GIPHY images through', async () => {
    const evil = { data: [{ id: 'x', title: 't', images: { fixed_width: { url: 'https://evil.example/p.gif', width: '1', height: '1' } } }], pagination: { total_count: 1, count: 1, offset: 0 } }
    const { giphy } = await loadGiphy({ functions: { invoke: async () => ({ data: evil, error: null }) } })
    expect((await giphy.trendingStickers()).stickers).toEqual([])
  })
})

let n = 0
let db: DogdexDB
let repo: ReturnType<typeof createLocalRepo>
beforeEach(() => {
  db = createDb(`stickers-${n++}`)
  repo = createLocalRepo(db)
})

/** A stand-in for Supabase, for the tests that sync stickers between two devices. */
function syncStore() {
  const rows = new Map<string, Map<string, RemoteRow>>()
  let clock = 0
  const store: RemoteStore = {
    async upsert(table, list) {
      const t = rows.get(table) ?? new Map<string, RemoteRow>()
      rows.set(table, t)
      for (const r of list as Record<string, unknown>[]) {
        const k = String(r.id ?? `${r.user_id}/${r.badge_id ?? r.key}`)
        const old = t.get(k)
        if (old && String(r.updated_at) < String(old.updated_at)) continue
        t.set(k, { ...r, server_updated_at: new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString() })
      }
    },
    async fetchSince(table, cursor, limit) {
      return [...(rows.get(table)?.values() ?? [])].filter((r) => r.server_updated_at > cursor).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit)
    },
    async uploadPhoto() {},
    async removePhotos() {},
    async downloadPhoto() {
      return new Blob(['x'])
    },
  }
  return store
}
const USER = '11111111-1111-4111-8111-111111111111'

const pic = (t: string) => ({ blob: new Blob([t]), thumb: new Blob([t + 't']), width: 400, height: 300 })
/** A dog with one photo, and that photo's id (stickers sit on a photo). */
async function dogWithPhoto(breedId = 'beagle') {
  const { dog } = await repo.logSighting({ breedId, metAt: 1, photo: pic('one') })
  const photoId = (await repo.getSnapshot()).dogs.find((d) => d.id === dog.id)!.primaryPhotoId!
  return { dog, photoId }
}

describe('restoring stickers (Cancel on the sticker controls)', () => {
  const live = async (r = repo) => (await r.getSnapshot()).stickers
  const startingPoint = async () => {
    const { dog, photoId } = await dogWithPhoto()
    const a = await repo.addSticker(dog.id, { ...sticker, photoId })
    const b = await repo.addSticker(dog.id, { ...sticker, photoId, giphyId: 'b' })
    return { dog, photoId, a, b, before: await live() }
  }

  it('undoes moving, resizing, rotating and reordering', async () => {
    const { dog, a, before } = await startingPoint()
    await repo.updateSticker(a.id, { x: 0.9, y: 0.1, scale: 0.8, rotation: 90, toFront: true })
    await repo.restoreStickers(dog.id, before)
    expect(await live()).toEqual(expect.arrayContaining(before.map((s) => expect.objectContaining({ id: s.id, x: s.x, y: s.y, scale: s.scale, rotation: s.rotation, z: s.z }))))
  })

  it('removes stickers that were added since', async () => {
    const { dog, photoId, before } = await startingPoint()
    await repo.addSticker(dog.id, { ...sticker, photoId, giphyId: 'extra' })
    expect(await live()).toHaveLength(3)
    await repo.restoreStickers(dog.id, before)
    expect((await live()).map((s) => s.id).sort()).toEqual(before.map((s) => s.id).sort())
  })

  it('brings back stickers that were removed since', async () => {
    const { dog, a, before } = await startingPoint()
    await repo.removeSticker(a.id)
    expect(await live()).toHaveLength(1)
    await repo.restoreStickers(dog.id, before)
    const back = (await live()).find((s) => s.id === a.id)
    expect(back).toMatchObject({ x: a.x, y: a.y, scale: a.scale })
    expect(back?.deletedAt).toBeUndefined()
  })

  it('does nothing when nothing changed, and leaves other dogs alone', async () => {
    const { dog, before } = await startingPoint()
    const other = await dogWithPhoto('akita')
    const stickerOnOther = await repo.addSticker(other.dog.id, { ...sticker, photoId: other.photoId })
    const touched = (await db.stickers.toArray()).map((s) => s.updatedAt)
    await repo.restoreStickers(dog.id, before)
    expect((await db.stickers.toArray()).map((s) => s.updatedAt)).toEqual(touched) // no needless writes, so nothing to sync
    // Restoring this dog's stickers never touches or removes another dog's.
    await repo.restoreStickers(dog.id, [])
    expect((await live()).map((s) => s.id)).toEqual([stickerOnOther.id])
  })

  it('syncs: the other device sees the restored state, not the in-between edits', async () => {
    const { dog, a, before } = await startingPoint()
    await repo.updateSticker(a.id, { x: 0.99 })
    await repo.restoreStickers(dog.id, before)
    expect((await live()).find((s) => s.id === a.id)?.x).toBe(a.x)
    expect((await db.stickers.get(a.id))?.updatedAt).toBeGreaterThanOrEqual(a.updatedAt)
  })
})

describe('a sticker belongs to one photo', () => {
  const stickersOf = async (photoId: string) => (await repo.getSnapshot()).stickers.filter((s) => s.photoId === photoId)

  it('records which photo it sits on, and refuses a photo that is not this dog’s, is gone, or does not exist', async () => {
    const { dog, photoId } = await dogWithPhoto()
    const s = await repo.addSticker(dog.id, { ...sticker, photoId })
    expect(s.photoId).toBe(photoId)
    const other = await dogWithPhoto('akita')
    await expect(repo.addSticker(dog.id, { ...sticker, photoId: other.photoId })).rejects.toThrow('Photo not found')
    await expect(repo.addSticker(dog.id, { ...sticker, photoId: 'nope' })).rejects.toThrow('Photo not found')
    const gone = await repo.addDogPhoto(dog.id, pic('gone'))
    await repo.deletePhoto(gone.id)
    await expect(repo.addSticker(dog.id, { ...sticker, photoId: gone.id })).rejects.toThrow('Photo not found')
  })

  it('stays on its photo when the cover photo changes', async () => {
    const { dog, photoId: first } = await dogWithPhoto()
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    const s = await repo.addSticker(dog.id, { ...sticker, photoId: first })
    await repo.setPrimaryPhoto(dog.id, second.id)
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBe(second.id)
    expect((await stickersOf(first)).map((x) => x.id)).toEqual([s.id]) // still on the first photo
    expect(await stickersOf(second.id)).toEqual([])
  })

  it('keeps each photo’s stickers separate', async () => {
    const { dog, photoId: first } = await dogWithPhoto()
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    const a = await repo.addSticker(dog.id, { ...sticker, photoId: first })
    const b = await repo.addSticker(dog.id, { ...sticker, photoId: second.id, giphyId: 'other' })
    expect((await stickersOf(first)).map((x) => x.id)).toEqual([a.id])
    expect((await stickersOf(second.id)).map((x) => x.id)).toEqual([b.id])
  })

  it('goes when its photo is deleted, and the other photos’ stickers stay', async () => {
    const { dog, photoId: first } = await dogWithPhoto()
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    await repo.addSticker(dog.id, { ...sticker, photoId: first })
    const kept = await repo.addSticker(dog.id, { ...sticker, photoId: second.id })
    await repo.deletePhoto(first)
    expect((await repo.getSnapshot()).stickers.map((x) => x.id)).toEqual([kept.id])
    expect((await db.stickers.toArray()).filter((x) => x.deletedAt)).toHaveLength(1) // a tombstone, so the removal syncs
  })

  it('a sticker from before this rule is attached to the dog’s cover photo, once', async () => {
    const { dog, photoId: first } = await dogWithPhoto()
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    await repo.setPrimaryPhoto(dog.id, second.id)
    // An old sticker: it has no photo of its own.
    const old = await repo.addSticker(dog.id, { ...sticker, photoId: first })
    await db.stickers.update(old.id, { photoId: undefined })
    expect(await repo.attachLooseStickers()).toBe(1)
    expect((await db.stickers.get(old.id))?.photoId).toBe(second.id) // the cover is where it was being shown
    expect(await repo.attachLooseStickers()).toBe(0) // nothing left to do
  })

  it('a loose sticker on a dog with no photo waits, then goes onto the first photo that is added', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const loose = { id: 'loose', dogId: dog.id, giphyId: 'a', url: GIF, width: 100, height: 100, x: 0.5, y: 0.5, scale: 0.3, rotation: 0, z: 1, createdAt: 1, updatedAt: 1 }
    await db.stickers.add(loose)
    expect(await repo.attachLooseStickers()).toBe(0) // no photo yet
    const photo = await repo.addDogPhoto(dog.id, pic('first'))
    expect((await db.stickers.get('loose'))?.photoId).toBe(photo.id)
  })

  it('syncs which photo it is on, and the other device keeps it there', async () => {
    const remote = syncStore()
    const dbB = createDb(`stickers-photo-b-${n}`)
    const repoB = createLocalRepo(dbB)
    const { dog, photoId: first } = await dogWithPhoto()
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    const s = await repo.addSticker(dog.id, { ...sticker, photoId: second.id })
    await claimDevice(db, USER)
    await syncOnce(db, remote, USER)
    await syncOnce(dbB, remote, USER)
    expect((await repoB.getSnapshot()).stickers.find((x) => x.id === s.id)?.photoId).toBe(second.id)
    expect(first).not.toBe(second.id)
  })
})

describe('stickers on dogs', () => {
  it('adds a sticker in the middle of the photo, in front of the others', async () => {
    const { dog, photoId } = await dogWithPhoto()
    const a = await repo.addSticker(dog.id, { ...sticker, photoId })
    const b = await repo.addSticker(dog.id, { ...sticker, photoId, giphyId: 'second' })
    expect(a).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 })
    expect(b.z).toBeGreaterThan(a.z)
    expect((await repo.getSnapshot()).stickers).toHaveLength(2)
  })

  it('moves, resizes and rotates, clamping to sensible limits', async () => {
    const { dog, photoId } = await dogWithPhoto()
    const s = await repo.addSticker(dog.id, { ...sticker, photoId })
    await repo.updateSticker(s.id, { x: 0.2, y: 2, scale: 5, rotation: 999 })
    expect((await repo.getSnapshot()).stickers[0]).toMatchObject({ x: 0.2, y: 1, scale: 1, rotation: 360 })
    await repo.updateSticker(s.id, { scale: 0 })
    expect((await repo.getSnapshot()).stickers[0].scale).toBe(0.05)
  })

  it('brings a sticker to the front', async () => {
    const { dog, photoId } = await dogWithPhoto()
    const a = await repo.addSticker(dog.id, { ...sticker, photoId })
    const b = await repo.addSticker(dog.id, { ...sticker, photoId, giphyId: 'b' })
    await repo.updateSticker(a.id, { toFront: true })
    const byId = Object.fromEntries((await repo.getSnapshot()).stickers.map((s) => [s.id, s.z]))
    expect(byId[a.id]).toBeGreaterThan(byId[b.id])
  })

  it('removes a sticker (soft delete) and frees a slot', async () => {
    const { dog, photoId } = await dogWithPhoto()
    const s = await repo.addSticker(dog.id, { ...sticker, photoId })
    await repo.removeSticker(s.id)
    expect((await repo.getSnapshot()).stickers).toHaveLength(0)
    expect(await db.stickers.count()).toBe(1) // kept as a tombstone so the delete can sync
  })

  it(`allows at most ${MAX_STICKERS_PER_PHOTO} per photo`, async () => {
    const { dog, photoId } = await dogWithPhoto()
    for (let i = 0; i < MAX_STICKERS_PER_PHOTO; i++) await repo.addSticker(dog.id, { ...sticker, photoId, giphyId: `s${i}` })
    await expect(repo.addSticker(dog.id, { ...sticker, photoId })).rejects.toThrow(/up to/)
    // The limit is per photo: another photo of the same dog, and another dog's photo, have room.
    const second = await repo.addDogPhoto(dog.id, pic('two'))
    await expect(repo.addSticker(dog.id, { ...sticker, photoId: second.id })).resolves.toBeDefined()
    const other = await dogWithPhoto('dachshund')
    await expect(repo.addSticker(other.dog.id, { ...sticker, photoId: other.photoId })).resolves.toBeDefined()
  })

  it('refuses anything that is not hosted by GIPHY', async () => {
    const { dog, photoId } = await dogWithPhoto()
    await expect(repo.addSticker(dog.id, { ...sticker, photoId, url: 'https://evil.example/x.gif' })).rejects.toThrow(/GIPHY/)
    await expect(repo.addSticker(dog.id, { ...sticker, photoId, stillUrl: 'http://media.giphy.com/x.gif' })).rejects.toThrow(/GIPHY/)
  })

  it("hides a removed dog's stickers", async () => {
    const { dog, photoId } = await dogWithPhoto()
    await repo.addSticker(dog.id, { ...sticker, photoId })
    await repo.deleteDog(dog.id)
    expect((await repo.getSnapshot()).stickers).toHaveLength(0)
  })
})

describe('sticker sync', () => {

  it('carries stickers, their placement and removals to another device', async () => {
    const remote = syncStore()
    const dbB = createDb(`stickers-b-${n}`)
    const repoB = createLocalRepo(dbB)
    const { dog, photoId } = await dogWithPhoto()
    const s = await repo.addSticker(dog.id, { ...sticker, photoId })
    await repo.updateSticker(s.id, { x: 0.25, y: 0.75, scale: 0.5, rotation: -30 })
    await claimDevice(db, USER)
    await syncOnce(db, remote, USER)
    await syncOnce(dbB, remote, USER)

    expect((await repoB.getSnapshot()).stickers[0]).toMatchObject({ giphyId: 'abc123', url: GIF, stillUrl: STILL, x: 0.25, y: 0.75, scale: 0.5, rotation: -30, title: 'Happy dog' })

    await new Promise((r) => setTimeout(r, 5))
    await repoB.removeSticker(s.id)
    await syncOnce(dbB, remote, USER)
    await syncOnce(db, remote, USER)
    expect((await repo.getSnapshot()).stickers).toHaveLength(0)
  })
})
