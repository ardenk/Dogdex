import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_STICKERS_PER_DOG } from '../domain/types'
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

describe('stickers on dogs', () => {
  it('adds a sticker in the middle of the photo, in front of the others', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addSticker(dog.id, sticker)
    const b = await repo.addSticker(dog.id, { ...sticker, giphyId: 'second' })
    expect(a).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 })
    expect(b.z).toBeGreaterThan(a.z)
    expect((await repo.getSnapshot()).stickers).toHaveLength(2)
  })

  it('moves, resizes and rotates, clamping to sensible limits', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const s = await repo.addSticker(dog.id, sticker)
    await repo.updateSticker(s.id, { x: 0.2, y: 2, scale: 5, rotation: 999 })
    expect((await repo.getSnapshot()).stickers[0]).toMatchObject({ x: 0.2, y: 1, scale: 1, rotation: 360 })
    await repo.updateSticker(s.id, { scale: 0 })
    expect((await repo.getSnapshot()).stickers[0].scale).toBe(0.05)
  })

  it('brings a sticker to the front', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addSticker(dog.id, sticker)
    const b = await repo.addSticker(dog.id, { ...sticker, giphyId: 'b' })
    await repo.updateSticker(a.id, { toFront: true })
    const byId = Object.fromEntries((await repo.getSnapshot()).stickers.map((s) => [s.id, s.z]))
    expect(byId[a.id]).toBeGreaterThan(byId[b.id])
  })

  it('removes a sticker (soft delete) and frees a slot', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const s = await repo.addSticker(dog.id, sticker)
    await repo.removeSticker(s.id)
    expect((await repo.getSnapshot()).stickers).toHaveLength(0)
    expect(await db.stickers.count()).toBe(1) // kept as a tombstone so the delete can sync
  })

  it(`allows at most ${MAX_STICKERS_PER_DOG} per dog`, async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    for (let i = 0; i < MAX_STICKERS_PER_DOG; i++) await repo.addSticker(dog.id, { ...sticker, giphyId: `s${i}` })
    await expect(repo.addSticker(dog.id, sticker)).rejects.toThrow(/up to/)
    const other = await repo.logSighting({ breedId: 'dachshund', metAt: 2 })
    await expect(repo.addSticker(other.dog.id, sticker)).resolves.toBeDefined()
  })

  it('refuses anything that is not hosted by GIPHY', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    await expect(repo.addSticker(dog.id, { ...sticker, url: 'https://evil.example/x.gif' })).rejects.toThrow(/GIPHY/)
    await expect(repo.addSticker(dog.id, { ...sticker, stillUrl: 'http://media.giphy.com/x.gif' })).rejects.toThrow(/GIPHY/)
  })

  it("hides a removed dog's stickers", async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    await repo.addSticker(dog.id, sticker)
    await repo.deleteDog(dog.id)
    expect((await repo.getSnapshot()).stickers).toHaveLength(0)
  })
})

describe('sticker sync', () => {
  function fakeStore() {
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

  it('carries stickers, their placement and removals to another device', async () => {
    const remote = fakeStore()
    const dbB = createDb(`stickers-b-${n}`)
    const repoB = createLocalRepo(dbB)
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const s = await repo.addSticker(dog.id, sticker)
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
