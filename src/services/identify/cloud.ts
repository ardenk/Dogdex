import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase } from '../../sync/client'
import { photoForIdentification } from '../images/resize'
import type { BreedIdentifier, RawPrediction } from './index'

/**
 * Breed suggestions from Google Cloud Vision, reached through the `identify-breed` Supabase Edge Function
 * (supabase/functions/identify-breed). The Vision key is a secret on the server and never ships in this app.
 *
 * Privacy: a small (800px) copy of the photo is sent to our function and on to Google. Nothing is stored by the
 * function. The app only does this when the user has turned on "Suggest breeds from photos" and is signed in.
 */

/** Photo identification needs the cloud connection (the function lives on Supabase). */
export const identifyAvailable = supabase !== null

export class IdentifyError extends Error {
  readonly kind: 'not-configured' | 'sign-in-required' | 'daily-limit' | 'rate-limited' | 'network' | 'other'
  constructor(kind: IdentifyError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

const responseSchema = z.object({ predictions: z.array(z.object({ breed: z.string(), confidence: z.number() })) })

/** Pure: checks the function's answer and keeps only well-formed predictions. */
export function parsePredictions(body: unknown): RawPrediction[] {
  return responseSchema.parse(body).predictions.map((p) => ({ breed: p.breed, confidence: Math.min(1, Math.max(0, p.confidence)) }))
}

export const cloudIdentifier: BreedIdentifier = {
  id: 'google-vision-v1',
  label: 'Suggestions from Google Cloud Vision',
  async identify(image: Blob): Promise<RawPrediction[]> {
    if (!supabase) throw new IdentifyError('not-configured', 'Photo suggestions are not set up yet.')
    const content = await photoForIdentification(image)
    const { data, error } = await supabase.functions.invoke('identify-breed', { body: { image: content } })
    if (error) {
      if (error instanceof FunctionsFetchError) throw new IdentifyError('network', 'Could not reach the suggestion service. Check your connection.')
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response
        const code = (await res.json().catch(() => null))?.error as string | undefined
        if (res.status === 401 || code === 'sign-in-required') throw new IdentifyError('sign-in-required', 'Sign in to get suggestions.')
        if (code === 'daily-limit') throw new IdentifyError('daily-limit', 'You have used today’s photo suggestions. They reset tomorrow.')
        if (res.status === 429 || code === 'rate-limited') throw new IdentifyError('rate-limited', 'Too many photos at once. Try again in a minute.')
        if (code === 'not-configured') throw new IdentifyError('not-configured', 'Photo suggestions are not set up on the server yet.')
      }
      throw new IdentifyError('other', 'The suggestion service had a problem. Pick the breed below.')
    }
    try {
      return parsePredictions(data)
    } catch {
      throw new IdentifyError('other', 'The suggestion service sent a response we could not read.')
    }
  },
}
