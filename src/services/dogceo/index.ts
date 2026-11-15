import { z } from 'zod'

/**
 * Photos for the breed quiz come from Dog CEO's free Dog API (https://dog.ceo/dog-api/), straight from the browser.
 * It needs no key and allows any website to call it. Images are on images.dog.ceo and come from the Stanford Dogs
 * Dataset. We only ever link to their images, never copy them.
 *
 * Privacy: asking for a photo tells dog.ceo the visitor's IP address, like any website you open. Nothing about the
 * user or their dogs is sent. The quiz start screen says so.
 */

const API = 'https://dog.ceo/api'
const TIMEOUT_MS = 6000

/** Only Dog CEO's own image host is ever shown, so a tampered response can't point the app at a tracking URL. */
export function isDogCeoImageUrl(value: string | undefined | null): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === 'images.dog.ceo'
  } catch {
    return false
  }
}

/** "beagle" or "hound/afghan": letters only, so a path can't be bent into another request. */
export const isDogCeoPath = (value: string): boolean => /^[a-z]+(\/[a-z]+)?$/.test(value)

export class QuizImageError extends Error {
  readonly kind: 'network' | 'unavailable'
  constructor(kind: QuizImageError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

const answerSchema = z.object({ status: z.literal('success'), message: z.string() })

export interface FetchOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** One random photo of the given Dog CEO breed. Rejects with a QuizImageError, or an AbortError if cancelled. */
export async function randomImageUrl(path: string, { signal, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }: FetchOptions = {}): Promise<string> {
  if (!isDogCeoPath(path)) throw new QuizImageError('unavailable', 'That breed has no photos.')
  const timer = new AbortController()
  const timeout = setTimeout(() => timer.abort(), timeoutMs)
  const onAbort = () => timer.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetchImpl(`${API}/breed/${path}/images/random`, { signal: timer.signal })
    if (!res.ok) throw new QuizImageError('unavailable', 'The photo service had a problem.')
    const parsed = answerSchema.safeParse(await res.json())
    if (!parsed.success || !isDogCeoImageUrl(parsed.data.message)) throw new QuizImageError('unavailable', 'The photo service sent something unexpected.')
    return parsed.data.message
  } catch (e) {
    if (e instanceof QuizImageError) throw e
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new QuizImageError('network', 'Could not reach the photo service. Check your connection.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Starts downloading a photo so it is ready when the next question appears. Resolves when loaded, rejects if it can't. */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('The photo did not load.'))
    img.src = url
  })
}
