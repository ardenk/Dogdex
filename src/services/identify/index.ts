import { orderedBreeds } from '../../data'
import type { Suggestion } from '../../domain/types'
import { cloudIdentifier } from './cloud'

/** What an identifier returns. `breed` is a free-form label ("Golden Retriever") or one of our breed ids. */
export interface RawPrediction {
  breed: string
  confidence: number
}

/**
 * Anything that can look at a dog photo and guess the breed.
 * Swap the active identifier below for an on-device model or a cloud function without touching any screen.
 */
export interface BreedIdentifier {
  /** Stored with each guess so accuracy can be compared across identifiers. */
  id: string
  /** Shown to the user, e.g. "Demo suggestions". */
  label: string
  identify(image: Blob): Promise<RawPrediction[]>
}

/** The real identifier. The random demo one (./mock) is only for tests and development: pass it to setIdentifier. */
let active: BreedIdentifier = cloudIdentifier

export function setIdentifier(identifier: BreedIdentifier) {
  active = identifier
}

export function getIdentifier(): BreedIdentifier {
  return active
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Maps a raw prediction to a breed in our dataset (by id, name, or alias). Unknown labels are dropped. */
export function resolveBreedId(label: string): string | undefined {
  const n = norm(label)
  return orderedBreeds.find((b) => norm(b.id) === n || norm(b.name) === n || b.aliases.some((a) => norm(a) === n))?.id
}

/**
 * Below this a suggestion is more likely noise than a breed. On a test with 21 real photos, nearly all of the
 * wrong picks (obscure breeds suggested for mixed dogs) scored 0.37 to 0.48, while every right pick scored 0.59 or more.
 * Better to say "no confident suggestion" than to name the wrong breed.
 */
export const MIN_CONFIDENCE = 0.5

/** identifyBreed(image) => [{breed, confidence}] — the interface from the brief, with breeds mapped to Dogdex ids. */
export async function identifyBreed(image: Blob): Promise<Suggestion[]> {
  const raw = await active.identify(image)
  const merged = new Map<string, number>()
  for (const p of raw) {
    if (p.confidence < MIN_CONFIDENCE) continue
    const breedId = resolveBreedId(p.breed)
    if (breedId) merged.set(breedId, Math.max(merged.get(breedId) ?? 0, p.confidence))
  }
  return [...merged.entries()]
    .map(([breedId, confidence]) => ({ breedId, confidence }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
}
