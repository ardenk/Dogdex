import { describe, expect, it } from 'vitest'
import { customBreedsNowListed } from '../domain/customBreeds'
import type { Dog } from '../domain/types'
import { resolveBreedId } from '../services/identify'

const dog = (id: string, over: Partial<Dog>): Dog => ({
  id, breedId: null, createdAt: 1, updatedAt: 1, firstMetAt: 1, lastMetAt: 1, ...over,
})

describe('customBreedsNowListed', () => {
  it('finds typed-in breeds that are now real entries, grouped by name', () => {
    const dogs = [
      dog('a', { customBreedLabel: 'Staffordshire Bull Terrier' }),
      dog('b', { customBreedLabel: 'Staffordshire Bull Terrier' }),
      dog('c', { customBreedLabel: 'Some breed nobody lists' }),
    ]
    expect(customBreedsNowListed(dogs, resolveBreedId)).toEqual([
      { label: 'Staffordshire Bull Terrier', breedId: 'staffordshire-bull-terrier', dogIds: ['a', 'b'] },
    ])
  })

  it('ignores dogs that already have a listed breed, and deleted dogs', () => {
    const dogs = [dog('a', { breedId: 'beagle' }), dog('b', { customBreedLabel: 'Pug', deletedAt: 5 })]
    expect(customBreedsNowListed(dogs, resolveBreedId)).toEqual([])
  })

  it('does not decide anything itself: it only reports what the resolver says', () => {
    expect(customBreedsNowListed([dog('a', { customBreedLabel: 'x' })], () => 'beagle')).toHaveLength(1)
    expect(customBreedsNowListed([dog('a', { customBreedLabel: 'x' })], () => undefined)).toHaveLength(0)
  })
})
