import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase } from '../../sync/client'
import { isGiphyUrl } from './validate'

/**
 * GIPHY Stickers (animated, transparent-background stickers), reached through the `giphy` Supabase Edge Function
 * (supabase/functions/giphy). The GIPHY API key is a secret on the server and never ships in this app.
 * GIPHY docs: https://developers.giphy.com/docs/api/endpoint#search
 *
 * Privacy: searches go from the user's browser to our function and on to GIPHY, and the sticker images load straight
 * from giphy.com, so GIPHY sees the search text and the IP address. The picker says so. Only rating "g" is requested.
 * We store only GIPHY ids and URLs, never copies of the images (GIPHY's terms require using their hosted URLs).
 * Only signed-in users can search; the function checks their login.
 */

/** Stickers need the cloud connection (the function lives on Supabase). */
export const giphyEnabled = supabase !== null

export interface GiphySticker {
  giphyId: string
  title: string
  url: string
  stillUrl?: string
  width: number
  height: number
}

export interface GiphyPage {
  stickers: GiphySticker[]
  /** Offset to pass for the next page, or null when there are no more results. */
  nextOffset: number | null
}

export class GiphyError extends Error {
  readonly kind: 'not-configured' | 'sign-in-required' | 'rate-limited' | 'network' | 'other'
  constructor(kind: GiphyError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

const imageSchema = z.object({
  url: z.string().optional(),
  webp: z.string().optional(),
  width: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
})
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional().default(''),
      images: z.object({ fixed_width: imageSchema.optional(), fixed_width_still: imageSchema.optional() }),
    }),
  ),
  pagination: z.object({ total_count: z.number(), count: z.number(), offset: z.number() }).optional(),
})

/** Pure: turns a GIPHY response body into our sticker shape, dropping anything unusable or not GIPHY-hosted. */
export function parseStickerResponse(body: unknown): GiphyPage {
  const parsed = responseSchema.parse(body)
  const stickers: GiphySticker[] = []
  for (const item of parsed.data) {
    const full = item.images.fixed_width
    // Prefer the animated webp (smaller) and fall back to the gif.
    const url = full?.webp || full?.url
    if (!full || !url || !isGiphyUrl(url)) continue
    const still = item.images.fixed_width_still?.url
    stickers.push({
      giphyId: item.id,
      title: item.title.trim() || 'Sticker',
      url,
      stillUrl: still && isGiphyUrl(still) ? still : undefined,
      width: full.width && full.width > 0 ? full.width : 200,
      height: full.height && full.height > 0 ? full.height : 200,
    })
  }
  const p = parsed.pagination
  const next = p ? p.offset + p.count : null
  return { stickers, nextOffset: p && next !== null && next < p.total_count && p.count > 0 ? next : null }
}

type Call = { kind: 'search'; query: string; offset: number } | { kind: 'trending'; offset: number }

async function request(call: Call, signal?: AbortSignal): Promise<GiphyPage> {
  if (!supabase) throw new GiphyError('not-configured', 'Stickers are not set up yet.')
  const { data, error } = await supabase.functions.invoke('giphy', { body: call, signal })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (error) {
    if (error instanceof FunctionsFetchError) throw new GiphyError('network', 'Could not reach the sticker service. Check your connection and try again.')
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response
      const code = (await res.json().catch(() => null))?.error as string | undefined
      if (res.status === 401 || code === 'sign-in-required') throw new GiphyError('sign-in-required', 'Sign in to add stickers.')
      if (res.status === 429 || code === 'rate-limited') throw new GiphyError('rate-limited', 'Too many sticker searches right now. Try again in a little while.')
      if (code === 'not-configured') throw new GiphyError('not-configured', 'Stickers are not set up on the server yet.')
    }
    throw new GiphyError('other', 'The sticker service had a problem. Try again in a moment.')
  }
  try {
    return parseStickerResponse(data)
  } catch {
    throw new GiphyError('other', 'The sticker service sent a response we could not read.')
  }
}

export const searchStickers = (query: string, offset = 0, signal?: AbortSignal) =>
  request({ kind: 'search', query: query.trim().slice(0, 50), offset }, signal)

export const trendingStickers = (offset = 0, signal?: AbortSignal) => request({ kind: 'trending', offset }, signal)
