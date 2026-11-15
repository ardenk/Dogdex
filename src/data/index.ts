import badges from './badges.json'
import breeds from './breeds.json'
import groups from './groups.json'
import rarities from './rarity.json'
import { parseData } from './schema'
import type { Breed, Group, RarityTier } from './schema'

export type { BadgeDef, BadgeRule, Breed, DogdexData, Group, RarityTier } from './schema'

/** Validated once at startup. A typo in a data file fails loudly here, not deep in the UI. */
export const data = parseData({ groups, rarities, breeds, badges })

export const groupsById: Record<string, Group> = Object.fromEntries(data.groups.map((g) => [g.id, g]))
export const raritiesById: Record<string, RarityTier> = Object.fromEntries(data.rarities.map((r) => [r.id, r]))
export const breedsById: Record<string, Breed> = Object.fromEntries(data.breeds.map((b) => [b.id, b]))

/** Breeds in Dogdex order (group order, then file order). */
export const orderedBreeds: Breed[] = data.groups.flatMap((g) => data.breeds.filter((b) => b.groupId === g.id))

/**
 * "No. 001"-style entry numbers. A breed keeps the `entry` written in breeds.json; any breed without one is
 * numbered after the highest existing number, in Dogdex order, so existing numbers never move.
 */
export const entryNumber: Record<string, number> = (() => {
  let next = Math.max(0, ...data.breeds.map((b) => b.entry ?? 0)) + 1
  return Object.fromEntries(orderedBreeds.map((b) => [b.id, b.entry ?? next++]))
})()

export function breedsInGroup(groupId: string): Breed[] {
  return data.breeds.filter((b) => b.groupId === groupId)
}
