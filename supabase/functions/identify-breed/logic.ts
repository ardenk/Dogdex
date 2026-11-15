/**
 * Breed identification proxy: the request handling, with everything environment-specific passed in so it can be
 * unit-tested outside Supabase (see src/test/identifyFunction.test.ts). index.ts wires it to Deno and Supabase.
 *
 * Why this exists: the Google Cloud Vision key lives here, as a Supabase secret, instead of in the app's JavaScript
 * where any visitor could read it and run up the bill. Each signed-in user also gets a daily allowance.
 *
 * Privacy: the photo is forwarded to Google Cloud Vision and is not stored or logged here.
 */

export interface Deps {
  /** The Cloud Vision key, from the GOOGLE_VISION_API_KEY secret. */
  apiKey: string | undefined
  /** Resolves the signed-in user's id from the Authorization header, or null for anonymous callers. */
  getUserId: (authHeader: string | null) => Promise<string | null>
  /** Uses one of the user's allowed photos for today. False once the daily allowance is spent. */
  takeDailySlot: (userId: string) => Promise<boolean>
  fetchImpl: typeof fetch
  now: () => number
}

export const CORS_HEADERS = {
  // No cookies are involved and access is controlled by the caller's sign-in token, so any origin may ask
  // (localhost, LAN addresses while testing on a phone, and the deployed site).
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VISION = 'https://vision.googleapis.com/v1/images:annotate'
/** The app sends an ~800px JPEG (about 100 to 300 KB). Base64 text is ~4/3 as long as the bytes it carries. */
export const MAX_IMAGE_CHARS = 1_500_000
const MAX_LABELS = 15
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 10

/** Best-effort burst limit per user (memory is per function instance, so it's a brake, not a guarantee). */
const hits = new Map<string, number[]>()
export function resetRateLimits() {
  hits.clear()
}
function overLimit(userId: string, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent)
    return true
  }
  recent.push(now)
  hits.set(userId, recent)
  return false
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const fail = (status: number, error: string, message: string) => json(status, { error, message })

/** Labels that describe "a dog" in general rather than a breed. Dropping them keeps the answer small. */
const GENERIC = new Set([
  'dog', 'dog breed', 'dog breed group', 'dog like mammal', 'dog supply', 'dog clothes', 'dog collar', 'dog harness', 'dog toy',
  'mammal', 'vertebrate', 'canidae', 'carnivore', 'pet', 'puppy', 'companion dog', 'working dog', 'sporting group', 'toy dog',
  'hound', 'terrier', 'stock photography', 'image', 'photograph', 'cat', 'breed', 'hunting dog', 'guard dog', 'cynology', 'snout', 'fur', 'whiskers', 'nose', 'ear', 'eye', 'paw', 'grass', 'plant', 'tail', 'collar', 'leash',
])

export interface Prediction {
  breed: string
  confidence: number
}

interface VisionEntry {
  description?: unknown
  score?: unknown
}

export interface VisionResponse {
  responses?: {
    labelAnnotations?: VisionEntry[]
    webDetection?: { webEntities?: VisionEntry[] }
    error?: { message?: string }
  }[]
}

/** Web entity scores are not 0 to 1 (they ran from about 0.5 to 1.8 on dog photos). Dividing by 2 puts them on the same footing as label scores. */
const WEB_SCALE = 2
const MAX_PREDICTIONS = 12

/**
 * Pure: merges Cloud Vision's two views of a photo into [{breed, confidence}], best first.
 *  - Label detection reads the pixels. It names a breed less often, but is rarely wrong when it does.
 *  - Web detection finds matching and similar pictures online. It names a breed far more often.
 * A breed both agree on gets a higher score than either alone (1 - (1 - a)(1 - b)). Generic labels like "Dog" are dropped.
 */
export function parseVision(body: VisionResponse): Prediction[] {
  const r = body.responses?.[0]
  const byName = new Map<string, { breed: string; label: number; web: number }>()
  const add = (entries: VisionEntry[] | undefined, kind: 'label' | 'web') => {
    for (const e of entries ?? []) {
      if (typeof e.description !== 'string' || typeof e.score !== 'number') continue
      const breed = e.description.trim()
      const key = breed.toLowerCase().replace(/[^a-z0-9]+/g, '')
      if (!key || GENERIC.has(breed.toLowerCase())) continue
      const score = Math.min(1, Math.max(0, kind === 'web' ? e.score / WEB_SCALE : e.score))
      const cur = byName.get(key) ?? { breed, label: 0, web: 0 }
      cur[kind] = Math.max(cur[kind], score)
      byName.set(key, cur)
    }
  }
  add(r?.labelAnnotations, 'label')
  add(r?.webDetection?.webEntities, 'web')
  return [...byName.values()]
    .map((c) => ({ breed: c.breed, confidence: Math.round((1 - (1 - c.label) * (1 - c.web)) * 1000) / 1000 }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PREDICTIONS)
}

/** Accepts a bare base64 string, or a data URL (which it unwraps). Returns null for anything that is not base64 JPEG/PNG/WebP data. */
function cleanImage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const bare = value.replace(/^data:image\/(?:jpeg|png|webp);base64,/, '')
  if (!bare || bare.length > MAX_IMAGE_CHARS) return null
  return /^[A-Za-z0-9+/]+={0,2}$/.test(bare) ? bare : null
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Use POST.')

  if (!deps.apiKey) return fail(500, 'not-configured', 'Photo identification has not been set up on the server.')

  const userId = await deps.getUserId(req.headers.get('Authorization'))
  if (!userId) return fail(401, 'sign-in-required', 'Sign in to identify breeds from photos.')

  let input: { image?: unknown }
  try {
    input = await req.json()
  } catch {
    return fail(400, 'bad-request', 'The request body must be JSON.')
  }
  const image = cleanImage(input.image)
  if (!image) return fail(400, 'bad-request', `image must be base64 JPEG, PNG or WebP data of at most ${MAX_IMAGE_CHARS} characters.`)

  // Checked only after the request is known to be valid, so a bad request never spends the allowance.
  if (overLimit(userId, deps.now())) return fail(429, 'rate-limited', 'Too many photos at once. Try again in a minute.')
  if (!(await deps.takeDailySlot(userId))) return fail(429, 'daily-limit', 'You have used today’s photo suggestions. They reset tomorrow.')

  let res: Response
  try {
    res = await deps.fetchImpl(VISION, {
      method: 'POST',
      // The key goes in a header, not the address, so it does not end up in anyone's request logs.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': deps.apiKey },
      body: JSON.stringify({ requests: [{ image: { content: image }, features: [{ type: 'LABEL_DETECTION', maxResults: MAX_LABELS }, { type: 'WEB_DETECTION', maxResults: MAX_LABELS }] }] }),
    })
  } catch {
    return fail(502, 'upstream-unreachable', 'Could not reach the identification service.')
  }
  if (res.status === 429) return fail(429, 'rate-limited', 'The identification service is busy. Try again in a little while.')
  if (!res.ok) {
    // Google's reason ("API key not valid", "billing not enabled"...) goes to the function log so a misconfiguration is findable.
    // It never contains our key; the photo is not included.
    console.error(`identify-breed: Cloud Vision answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
    return fail(502, 'upstream-error', `The identification service returned an error (${res.status}).`)
  }
  try {
    const body = await res.json()
    if (body.responses?.[0]?.error) {
      console.error(`identify-breed: Cloud Vision could not process the photo: ${String(body.responses[0].error.message ?? '').slice(0, 300)}`)
      return fail(502, 'upstream-error', 'The identification service could not read that photo.')
    }
    return json(200, { predictions: parseVision(body) })
  } catch {
    return fail(502, 'upstream-error', 'The identification service sent a response we could not read.')
  }
}
