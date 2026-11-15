import type { Dog } from './types'

export interface NowListed {
  /** The breed name the user typed. */
  label: string
  /** The listed breed it matches. */
  breedId: string
  dogIds: string[]
}

/**
 * Dogs filed under a typed-in breed name that has since appeared in the breed list (for example after the list
 * was expanded). The Dogdex offers to move them to the real entry; nothing is moved automatically.
 * `resolve` maps a name to a listed breed id, or undefined (see resolveBreedId in services/identify).
 */
export function customBreedsNowListed(dogs: Dog[], resolve: (label: string) => string | undefined): NowListed[] {
  const byLabel = new Map<string, NowListed>()
  for (const d of dogs) {
    if (d.deletedAt || d.breedId || !d.customBreedLabel) continue
    const hit = byLabel.get(d.customBreedLabel)
    if (hit) {
      hit.dogIds.push(d.id)
      continue
    }
    const breedId = resolve(d.customBreedLabel)
    if (breedId) byLabel.set(d.customBreedLabel, { label: d.customBreedLabel, breedId, dogIds: [d.id] })
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label))
}
