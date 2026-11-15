import type { Breed } from '../data/schema'
import { stackPhotoIds } from './photos'
import { norm, searchBreeds } from './search'
import type { Dog } from './types'

/** One card in the Dogdex: a listed breed, or a breed the user typed in. */
export interface Tile {
  key: string
  kind: 'breed' | 'custom'
  name: string
  /** Where tapping the card goes. */
  href: string
  breed?: Breed
  /** The category a typed-in breed is filed under, if any. */
  groupId?: string
  /** Dogs of this breed the user has logged. 0 means not met yet. */
  count: number
  /** When one of them was last seen (0 if none). */
  lastMetAt: number
  /** Photos for the card's stack, newest dog first. */
  photoIds: string[]
}

export interface DogIndex {
  byBreed: Map<string, Dog[]>
  /** Typed-in breeds, by the name the user typed. */
  byLabel: Map<string, Dog[]>
}

/** Groups the user's dogs by breed so tiles can be built without rescanning every dog. */
export function indexDogs(dogs: Dog[]): DogIndex {
  const byBreed = new Map<string, Dog[]>()
  const byLabel = new Map<string, Dog[]>()
  for (const d of dogs) {
    if (d.deletedAt) continue
    const bucket = d.breedId ? byBreed : d.customBreedLabel ? byLabel : null
    const key = d.breedId ?? d.customBreedLabel
    if (!bucket || !key) continue
    bucket.set(key, [...(bucket.get(key) ?? []), d])
  }
  return { byBreed, byLabel }
}

const lastMet = (dogs: Dog[]) => dogs.reduce((m, d) => Math.max(m, d.lastMetAt), 0)

export function breedTile(breed: Breed, index: DogIndex): Tile {
  const dogs = index.byBreed.get(breed.id) ?? []
  return { key: breed.id, kind: 'breed', name: breed.name, href: `/dogdex/breed/${breed.id}`, breed, count: dogs.length, lastMetAt: lastMet(dogs), photoIds: stackPhotoIds(dogs) }
}

export function customTile(label: string, index: DogIndex): Tile {
  const dogs = index.byLabel.get(label) ?? []
  return {
    key: `custom-${label}`,
    kind: 'custom',
    name: label,
    href: `/dogdex/other/${encodeURIComponent(label)}`,
    groupId: dogs.find((d) => d.customGroupId)?.customGroupId,
    count: dogs.length,
    lastMetAt: lastMet(dogs),
    photoIds: stackPhotoIds(dogs),
  }
}

/** Dogs you have logged first (most recently met on top), then the breeds you haven't met, in Dogdex order. */
export function orderTiles(tiles: Tile[]): Tile[] {
  const met = tiles.filter((t) => t.count > 0).sort((a, b) => b.lastMetAt - a.lastMetAt)
  return [...met, ...tiles.filter((t) => t.count === 0)]
}

/** Every card in a category: its listed breeds plus typed-in breeds filed there, logged ones first. */
export function groupTiles(breeds: Breed[], groupId: string, index: DogIndex): Tile[] {
  const listed = breeds.filter((b) => b.groupId === groupId).map((b) => breedTile(b, index))
  const typed = [...index.byLabel.keys()].map((l) => customTile(l, index)).filter((t) => t.groupId === groupId)
  return orderTiles([...listed, ...typed])
}

/** Typed-in breeds whose category is missing or no longer exists. */
export function uncategorizedTiles(index: DogIndex, groupIds: string[]): Tile[] {
  return [...index.byLabel.keys()]
    .map((l) => customTile(l, index))
    .filter((t) => !t.groupId || !groupIds.includes(t.groupId))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Breeds and typed-in breeds matching a search, best match first. `groupId` limits it to one category. */
export function searchTiles(breeds: Breed[], index: DogIndex, query: string, opts: { groupId?: string; limit?: number } = {}): Tile[] {
  const q = norm(query)
  if (!q) return []
  const limit = opts.limit ?? 60
  const pool = opts.groupId ? breeds.filter((b) => b.groupId === opts.groupId) : breeds
  const listed = searchBreeds(pool, query, limit).map((b) => breedTile(b, index))
  const typed = [...index.byLabel.keys()]
    .filter((l) => norm(l).includes(q))
    .map((l) => customTile(l, index))
    .filter((t) => !opts.groupId || t.groupId === opts.groupId)
  return [...typed, ...listed].slice(0, limit)
}
