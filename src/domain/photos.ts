import type { Dog } from './types'

/** How many photos a breed tile stacks. */
export const STACK_SIZE = 3

/**
 * The photos to stack on a breed tile: one per dog that has a photo, the dog seen most recently first
 * (that is the one drawn on top). Dogs without a photo are skipped. "Seen" includes "Met again",
 * which updates a dog's `lastMetAt`.
 */
export function stackPhotoIds(dogs: Dog[], max = STACK_SIZE): string[] {
  return dogs
    .filter((d) => !!d.primaryPhotoId)
    .sort((a, b) => b.lastMetAt - a.lastMetAt || b.createdAt - a.createdAt)
    .slice(0, max)
    .map((d) => d.primaryPhotoId as string)
}
