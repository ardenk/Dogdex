import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handle, MAX_IMAGE_CHARS, parseVision, resetRateLimits } from '../../supabase/functions/identify-breed/logic'
import type { Deps } from '../../supabase/functions/identify-breed/logic'

const visionBody = {
  responses: [
    {
      labelAnnotations: [
        { description: 'Dog', score: 0.98, mid: '/m/0bt9lr', topicality: 0.98 },
        { description: 'Golden retriever', score: 0.91 },
        { description: 'Dog breed', score: 0.9 },
        { description: 'Retriever', score: 0.77 },
        { description: 'Carnivore', score: 0.7 },
        { description: 'Labrador Retriever', score: 0.6 },
        { description: 12 as unknown as string, score: 0.5 }, // malformed entries are skipped
      ],
    },
  ],
}

const photo = 'QUJD' // a few base64 characters stand in for image bytes

const call = (body: unknown, deps: Partial<Deps> = {}, init: RequestInit = {}) => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(visionBody), { status: 200 }))
  const takeDailySlot = vi.fn(async () => true)
  const all: Deps = { apiKey: 'secret-key', getUserId: async () => 'user-1', takeDailySlot, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 1_000_000, ...deps }
  const req = new Request('https://x.test/identify-breed', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init })
  return { run: () => handle(req, all), fetchImpl: all.fetchImpl as unknown as ReturnType<typeof vi.fn>, takeDailySlot: all.takeDailySlot as unknown as ReturnType<typeof vi.fn> }
}

beforeEach(() => resetRateLimits())

describe('parseVision', () => {
  it('merges labels and web entities: a breed both agree on outranks one only a single method found', () => {
    const out = parseVision({
      responses: [
        {
          labelAnnotations: [{ description: 'Bernese Mountain Dog', score: 0.94 }, { description: 'Dog', score: 1 }],
          // Web scores are not 0 to 1; these are typical values.
          webDetection: { webEntities: [{ description: 'Australian Shepherd', score: 1.47 }, { description: 'Bernese mountain dog', score: 1.3 }, { description: 'Stock photography', score: 0.7 }] },
        },
      ],
    })
    expect(out.map((p) => p.breed)).toEqual(['Bernese Mountain Dog', 'Australian Shepherd'])
    expect(out[0].confidence).toBeGreaterThan(0.95)
    expect(out[1].confidence).toBeCloseTo(0.735, 2)
  })

  it('uses web entities alone when the labels name no breed, and never exceeds 1', () => {
    const out = parseVision({ responses: [{ labelAnnotations: [{ description: 'Dog', score: 1 }], webDetection: { webEntities: [{ description: 'Labrador Retriever', score: 1.9 }, { description: 'Pug', score: 5 }] } }] })
    expect(out.map((p) => p.breed)).toEqual(['Pug', 'Labrador Retriever'])
    expect(out[0].confidence).toBe(1)
  })

  it('keeps at most a dozen predictions', () => {
    const labelAnnotations = Array.from({ length: 30 }, (_, i) => ({ description: `Breed ${i}`, score: 0.5 }))
    expect(parseVision({ responses: [{ labelAnnotations }] })).toHaveLength(12)
  })

  it('drops generic labels and malformed entries, best first', () => {
    expect(parseVision(visionBody)).toEqual([
      { breed: 'Golden retriever', confidence: 0.91 },
      { breed: 'Retriever', confidence: 0.77 },
      { breed: 'Labrador Retriever', confidence: 0.6 },
    ])
  })

  it('returns nothing for an empty or unexpected response', () => {
    expect(parseVision({})).toEqual([])
    expect(parseVision({ responses: [{}] })).toEqual([])
  })
})

describe('identify-breed edge function', () => {
  it('answers CORS preflights for any app origin', async () => {
    const res = await handle(new Request('https://x.test/f', { method: 'OPTIONS' }), { apiKey: 'k', getUserId: async () => null, takeDailySlot: async () => true, fetchImpl: fetch, now: Date.now })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('only accepts POST', async () => {
    const res = await handle(new Request('https://x.test/f', { method: 'GET' }), { apiKey: 'k', getUserId: async () => 'u', takeDailySlot: async () => true, fetchImpl: fetch, now: Date.now })
    expect(res.status).toBe(405)
  })

  it('refuses anonymous callers and never contacts Google for them', async () => {
    const { run, fetchImpl, takeDailySlot } = call({ image: photo }, { getUserId: async () => null })
    const res = await run()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'sign-in-required' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(takeDailySlot).not.toHaveBeenCalled()
  })

  it('reports a missing server key without contacting anyone', async () => {
    const { run, fetchImpl } = call({ image: photo }, { apiKey: undefined })
    const res = await run()
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'not-configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects bodies that are not JSON, not base64, or too large, without spending the daily allowance', async () => {
    for (const body of ['not json', { image: 42 }, { image: 'not base64!!' }, { image: 'A'.repeat(MAX_IMAGE_CHARS + 1) }, {}]) {
      const { run, fetchImpl, takeDailySlot } = call(body)
      expect((await run()).status).toBe(400)
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(takeDailySlot).not.toHaveBeenCalled()
    }
  })

  it('accepts a data URL and sends only the base64 part to Google, with the key in a header', async () => {
    const { run, fetchImpl } = call({ image: `data:image/jpeg;base64,${photo}` })
    const res = await run()
    expect(res.status).toBe(200)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://vision.googleapis.com/v1/images:annotate')
    expect(url).not.toContain('secret-key')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key')
    const sent = JSON.parse(init.body as string)
    expect(sent.requests[0].image.content).toBe(photo)
    expect(sent.requests[0].features.map((f: { type: string }) => f.type)).toEqual(['LABEL_DETECTION', 'WEB_DETECTION'])
  })

  it('returns only breed predictions, never Google’s extra fields, and is not cached', async () => {
    const res = await call({ image: photo }).run()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['predictions'])
    expect(body.predictions[0]).toEqual({ breed: 'Golden retriever', confidence: 0.91 })
    expect(JSON.stringify(body)).not.toContain('mid')
  })

  it('stops at the daily allowance and does not call Google', async () => {
    const { run, fetchImpl } = call({ image: photo }, { takeDailySlot: async () => false })
    const res = await run()
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'daily-limit' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('brakes a burst of photos from one user', async () => {
    let last = 200
    for (let i = 0; i < 11; i++) last = (await call({ image: photo }).run()).status
    expect(last).toBe(429)
  })

  it('maps Google failures to clear errors', async () => {
    const down = call({ image: photo }, { fetchImpl: (async () => { throw new Error('offline') }) as unknown as typeof fetch })
    expect((await down.run()).status).toBe(502)
    const bad = call({ image: photo }, { fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch })
    expect(await (await bad.run()).json()).toMatchObject({ error: 'upstream-error' })
    const busy = call({ image: photo }, { fetchImpl: (async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch })
    expect((await busy.run()).status).toBe(429)
    const unreadable = call({ image: photo }, { fetchImpl: (async () => new Response(JSON.stringify({ responses: [{ error: { message: 'bad image' } }] }), { status: 200 })) as unknown as typeof fetch })
    expect(await (await unreadable.run()).json()).toMatchObject({ error: 'upstream-error' })
  })
})
