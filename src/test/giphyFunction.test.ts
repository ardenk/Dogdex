import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handle, resetRateLimits, trimResponse } from '../../supabase/functions/giphy/logic'
import type { Deps } from '../../supabase/functions/giphy/logic'

const giphyBody = {
  data: [
    {
      id: 'a1',
      title: 'Party',
      username: 'someone', // fields the app doesn't need
      user: { display_name: 'x' },
      analytics: { onload: { url: 'https://giphy-analytics.example/x' } },
      images: { fixed_width: { url: 'https://media1.giphy.com/media/a1/200w.gif', webp: 'https://media1.giphy.com/media/a1/200w.webp', width: '200', height: '150', size: '9999' }, fixed_width_still: { url: 'https://media1.giphy.com/media/a1/200w_s.gif' }, original: { url: 'big' } },
    },
    { title: 'no id' },
  ],
  pagination: { total_count: 100, count: 1, offset: 0 },
  meta: { status: 200, response_id: 'z' },
}

const call = (body: unknown, deps: Partial<Deps> = {}, init: RequestInit = {}) => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(giphyBody), { status: 200 }))
  const all: Deps = { apiKey: 'secret-key', getUserId: async () => 'user-1', fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 1_000_000, ...deps }
  const req = new Request('https://x.test/giphy', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init })
  return { run: () => handle(req, all), fetchImpl: all.fetchImpl as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => resetRateLimits())

describe('giphy edge function', () => {
  it('answers CORS preflights for any app origin', async () => {
    const res = await handle(new Request('https://x.test/giphy', { method: 'OPTIONS' }), { apiKey: 'k', getUserId: async () => null, fetchImpl: fetch, now: Date.now })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization')
  })

  it('only accepts POST', async () => {
    const { run } = call({}, {}, { method: 'POST' })
    expect((await handle(new Request('https://x.test/giphy', { method: 'GET' }), { apiKey: 'k', getUserId: async () => 'u', fetchImpl: fetch, now: Date.now })).status).toBe(405)
    expect((await run()).status).toBe(400) // POST without a valid body
  })

  it('refuses anonymous callers and never contacts GIPHY for them', async () => {
    const { run, fetchImpl } = call({ kind: 'trending' }, { getUserId: async () => null })
    const res = await run()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'sign-in-required' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes the Authorization header through to be checked', async () => {
    const getUserId = vi.fn(async () => 'user-1')
    await call({ kind: 'trending' }, { getUserId }).run()
    expect(getUserId).toHaveBeenCalledWith('Bearer t')
  })

  it('reports a missing secret clearly, before doing anything else', async () => {
    const { run, fetchImpl } = call({ kind: 'trending' }, { apiKey: undefined })
    const res = await run()
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'not-configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('asks GIPHY for rated-G stickers with the secret key, and returns only what the app needs', async () => {
    const { run, fetchImpl } = call({ kind: 'search', query: '  happy dog  ', offset: 24 })
    const res = await run()
    expect(res.status).toBe(200)
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url.origin + url.pathname).toBe('https://api.giphy.com/v1/stickers/search')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ api_key: 'secret-key', rating: 'g', limit: '24', offset: '24', q: 'happy dog', lang: 'en' })

    const out = await res.json()
    expect(JSON.stringify(out)).not.toContain('secret-key')
    expect(out.data).toHaveLength(1) // the entry without an id is dropped
    expect(out.data[0]).toEqual({
      id: 'a1',
      title: 'Party',
      images: {
        fixed_width: { url: 'https://media1.giphy.com/media/a1/200w.gif', webp: 'https://media1.giphy.com/media/a1/200w.webp', width: '200', height: '150' },
        fixed_width_still: { url: 'https://media1.giphy.com/media/a1/200w_s.gif' },
      },
    })
    expect(out.pagination).toEqual({ total_count: 100, count: 1, offset: 0 })
    expect(out).not.toHaveProperty('meta')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60')
  })

  it('uses the trending endpoint without a search term', async () => {
    const { run, fetchImpl } = call({ kind: 'trending' })
    await run()
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url.pathname).toBe('/v1/stickers/trending')
    expect(url.searchParams.has('q')).toBe(false)
  })

  it('limits search words to 50 characters', async () => {
    const { run, fetchImpl } = call({ kind: 'search', query: 'y'.repeat(200) })
    await run()
    expect(new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]).searchParams.get('q')).toBe('y'.repeat(50))
  })

  it.each([
    ['not JSON', 'nope'],
    ['an unknown kind', { kind: 'gifs' }],
    ['a search with no words', { kind: 'search', query: '   ' }],
    ['a search with a non-text query', { kind: 'search', query: 42 }],
    ['a negative offset', { kind: 'trending', offset: -1 }],
    ['a fractional offset', { kind: 'trending', offset: 1.5 }],
    ['an offset GIPHY would refuse', { kind: 'trending', offset: 5000 }],
    ['a text offset', { kind: 'trending', offset: '10' }],
  ])('rejects %s without calling GIPHY', async (_label, body) => {
    const { run, fetchImpl } = call(body)
    expect((await run()).status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps GIPHY problems to clear errors', async () => {
    const respond = (status: number) => ({ fetchImpl: (async () => new Response('{}', { status })) as unknown as typeof fetch })
    expect((await call({ kind: 'trending' }, respond(429)).run()).status).toBe(429)
    const down = await call({ kind: 'trending' }, respond(503)).run()
    expect([down.status, (await down.json()).error]).toEqual([502, 'upstream-error'])
    const unreachable = await call({ kind: 'trending' }, { fetchImpl: (async () => { throw new TypeError('offline') }) as unknown as typeof fetch }).run()
    expect([unreachable.status, (await unreachable.json()).error]).toEqual([502, 'upstream-unreachable'])
    const garbled = await call({ kind: 'trending' }, { fetchImpl: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch }).run()
    expect(garbled.status).toBe(502)
  })

  it('slows down one user who searches too fast, but not other users', async () => {
    let user = 'busy'
    const deps = { getUserId: async () => user }
    for (let i = 0; i < 60; i++) expect((await call({ kind: 'trending' }, deps).run()).status).toBe(200)
    const blocked = await call({ kind: 'trending' }, deps).run()
    expect([blocked.status, (await blocked.json()).error]).toEqual([429, 'rate-limited'])
    user = 'someone-else'
    expect((await call({ kind: 'trending' }, deps).run()).status).toBe(200)
  })

  it('lets a user search again after the minute is up', async () => {
    let now = 0
    const deps = { getUserId: async () => 'u', now: () => now }
    for (let i = 0; i < 60; i++) await call({ kind: 'trending' }, deps).run()
    expect((await call({ kind: 'trending' }, deps).run()).status).toBe(429)
    now = 61_000
    expect((await call({ kind: 'trending' }, deps).run()).status).toBe(200)
  })
})

describe('trimResponse', () => {
  it('copes with a missing or empty body', () => {
    expect(trimResponse({})).toEqual({ data: [], pagination: { total_count: 0, count: 0, offset: 0 } })
  })
})
