/**
 * GIPHY sticker proxy: the request handling, with everything environment-specific passed in so it can be
 * unit-tested outside Supabase (see src/test/giphyFunction.test.ts). index.ts wires it to Deno and Supabase.
 *
 * Why this exists: the GIPHY API key lives here, as a Supabase secret, instead of in the app's JavaScript
 * where any visitor could read it and use up its rate limit.
 */

export interface Deps {
  /** The GIPHY key, from the GIPHY_API_KEY_DOGDEX secret. */
  apiKey: string | undefined
  /** Resolves the signed-in user's id from the Authorization header, or null for anonymous callers. */
  getUserId: (authHeader: string | null) => Promise<string | null>
  fetchImpl: typeof fetch
  now: () => number
}

export const CORS_HEADERS = {
  // The app is served from localhost, LAN addresses and (later) your own domain, and no cookies are involved, so any
  // origin may ask. Access is controlled by the caller's sign-in token, not by origin.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GIPHY = 'https://api.giphy.com/v1/stickers'
const PAGE_SIZE = 24
const MAX_QUERY = 50
const MAX_OFFSET = 4999 // GIPHY rejects anything higher
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60

/** Best-effort per-user limit (this memory is per function instance, so it's a brake, not a guarantee). */
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

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra } })

const fail = (status: number, error: string, message: string) => json(status, { error, message })

interface GiphyImage {
  url?: string
  webp?: string
  width?: string
  height?: string
}
interface GiphyItem {
  id?: string
  title?: string
  images?: { fixed_width?: GiphyImage; fixed_width_still?: GiphyImage }
}

/** Passes along only the fields the app uses (not GIPHY's user, source and analytics data). */
export function trimResponse(body: { data?: GiphyItem[]; pagination?: { total_count?: number; count?: number; offset?: number } }) {
  return {
    data: (body.data ?? [])
      .filter((d) => typeof d.id === 'string')
      .map((d) => ({
        id: d.id,
        title: d.title ?? '',
        images: {
          fixed_width: { url: d.images?.fixed_width?.url, webp: d.images?.fixed_width?.webp, width: d.images?.fixed_width?.width, height: d.images?.fixed_width?.height },
          fixed_width_still: { url: d.images?.fixed_width_still?.url },
        },
      })),
    pagination: {
      total_count: Number(body.pagination?.total_count ?? 0),
      count: Number(body.pagination?.count ?? 0),
      offset: Number(body.pagination?.offset ?? 0),
    },
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST') return fail(405, 'method-not-allowed', 'Use POST.')

  if (!deps.apiKey) return fail(500, 'not-configured', 'The GIPHY key has not been set up on the server.')

  const userId = await deps.getUserId(req.headers.get('Authorization'))
  if (!userId) return fail(401, 'sign-in-required', 'Sign in to search for stickers.')
  if (overLimit(userId, deps.now())) return fail(429, 'rate-limited', 'Too many searches. Try again in a minute.')

  let input: { kind?: unknown; query?: unknown; offset?: unknown }
  try {
    input = await req.json()
  } catch {
    return fail(400, 'bad-request', 'The request body must be JSON.')
  }
  const kind = input.kind
  if (kind !== 'search' && kind !== 'trending') return fail(400, 'bad-request', 'kind must be "search" or "trending".')
  const offset = input.offset === undefined ? 0 : input.offset
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return fail(400, 'bad-request', `offset must be a whole number from 0 to ${MAX_OFFSET}.`)
  }
  const params = new URLSearchParams({ api_key: deps.apiKey, rating: 'g', limit: String(PAGE_SIZE), offset: String(offset) })
  if (kind === 'search') {
    const q = typeof input.query === 'string' ? input.query.trim().slice(0, MAX_QUERY) : ''
    if (!q) return fail(400, 'bad-request', 'A search needs some words.')
    params.set('q', q)
    params.set('lang', 'en')
  }

  let res: Response
  try {
    res = await deps.fetchImpl(`${GIPHY}/${kind}?${params}`)
  } catch {
    return fail(502, 'upstream-unreachable', 'Could not reach GIPHY.')
  }
  if (res.status === 429) return fail(429, 'rate-limited', 'GIPHY is rate-limiting this app. Try again in a little while.')
  if (!res.ok) return fail(502, 'upstream-error', `GIPHY returned an error (${res.status}).`)
  try {
    // private: the answer depends on who asked, so shared caches must not keep it; the browser may reuse it briefly.
    return json(200, trimResponse(await res.json()), { 'Cache-Control': 'private, max-age=60' })
  } catch {
    return fail(502, 'upstream-error', 'GIPHY sent a response we could not read.')
  }
}
