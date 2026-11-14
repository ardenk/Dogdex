import { breedsById } from '../data'
import type { Dog } from './types'

export const breedName = (dog: Pick<Dog, 'breedId' | 'customBreedLabel'>): string =>
  (dog.breedId && breedsById[dog.breedId]?.name) || dog.customBreedLabel || 'Unknown breed'

/** The group a dog is filed under: its breed's group, or the group chosen for a custom breed. */
export const dogGroupId = (dog: Pick<Dog, 'breedId' | 'customGroupId'>): string | undefined =>
  dog.breedId ? breedsById[dog.breedId]?.groupId : dog.customGroupId

export const dogTitle = (dog: Dog): string => dog.name ?? `Unnamed ${breedName(dog)}`

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export const formatDateTime = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for <input type="datetime-local">, in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): number {
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? Date.now() : t
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export const entryLabel = (n: number): string => `No. ${String(n).padStart(3, '0')}`
