import { describe, expect, it, vi } from 'vitest'
import { isDogCeoImageUrl, isDogCeoPath, QuizImageError, randomImageUrl } from '../services/dogceo'

const ok = (message: string) => vi.fn(async () => new Response(JSON.stringify({ status: 'success', message }), { status: 200 }))

describe('isDogCeoImageUrl', () => {
  it('accepts only https images on images.dog.ceo', () => {
    expect(isDogCeoImageUrl('https://images.dog.ceo/breeds/beagle/n02088364_1.jpg')).toBe(true)
    for (const bad of ['http://images.dog.ceo/a.jpg', 'https://dog.ceo/a.jpg', 'https://images.dog.ceo.evil.test/a.jpg', 'https://evil.test/images.dog.ceo/a.jpg', 'javascript:alert(1)', '', 'not a url']) {
      expect(isDogCeoImageUrl(bad), bad).toBe(false)
    }
    expect(isDogCeoImageUrl(undefined)).toBe(false)
  })
})

describe('isDogCeoPath', () => {
  it('allows a breed or breed/sub-breed and nothing else', () => {
    expect(isDogCeoPath('beagle')).toBe(true)
    expect(isDogCeoPath('hound/afghan')).toBe(true)
    for (const bad of ['', '../x', 'a/b/c', 'Beagle', 'beagle?x=1', 'hound/', '/hound']) expect(isDogCeoPath(bad), bad).toBe(false)
  })
})

describe('randomImageUrl', () => {
  it('asks Dog CEO for a random photo of that breed and returns its address', async () => {
    const f = ok('https://images.dog.ceo/breeds/hound-afghan/n02088094_688.jpg')
    expect(await randomImageUrl('hound/afghan', { fetchImpl: f as unknown as typeof fetch })).toBe('https://images.dog.ceo/breeds/hound-afghan/n02088094_688.jpg')
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://dog.ceo/api/breed/hound/afghan/images/random')
  })

  it('refuses a photo from anywhere else, an error answer, or a malformed one', async () => {
    await expect(randomImageUrl('beagle', { fetchImpl: ok('https://evil.test/a.jpg') as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'unavailable' })
    const failed = vi.fn(async () => new Response('{"status":"error","message":"Breed not found","code":404}', { status: 404 }))
    await expect(randomImageUrl('beagle', { fetchImpl: failed as unknown as typeof fetch })).rejects.toBeInstanceOf(QuizImageError)
    const odd = vi.fn(async () => new Response('{"hello":1}', { status: 200 }))
    await expect(randomImageUrl('beagle', { fetchImpl: odd as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('never makes a request for a bad path', async () => {
    const f = ok('https://images.dog.ceo/a.jpg')
    await expect(randomImageUrl('../etc', { fetchImpl: f as unknown as typeof fetch })).rejects.toBeInstanceOf(QuizImageError)
    expect(f).not.toHaveBeenCalled()
  })

  it('reports being offline as a network problem', async () => {
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(randomImageUrl('beagle', { fetchImpl: offline as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'network' })
  })

  it('gives up after the timeout', async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))))
    await expect(randomImageUrl('beagle', { fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'network' })
  })

  it('lets the caller cancel (leaving the quiz) without reporting an error', async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))))
    const ctl = new AbortController()
    const p = randomImageUrl('beagle', { fetchImpl: hang as unknown as typeof fetch, signal: ctl.signal })
    ctl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
