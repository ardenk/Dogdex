import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { stackPhotoIds } from '../domain/photos'
import type { Dog, Snapshot } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DogdexPage } from '../features/dogdex/DogdexPage'
import { DataContext } from '../storage/data-context'

const dog = (id: string, over: Partial<Dog> = {}): Dog => ({ id, breedId: 'french-bulldog', firstMetAt: 1, lastMetAt: 1, createdAt: 1, updatedAt: 1, ...over })

describe('stackPhotoIds', () => {
  it('puts the most recently seen dog on top', () => {
    const ids = stackPhotoIds([dog('a', { primaryPhotoId: 'pa', lastMetAt: 100 }), dog('b', { primaryPhotoId: 'pb', lastMetAt: 300 }), dog('c', { primaryPhotoId: 'pc', lastMetAt: 200 })])
    expect(ids).toEqual(['pb', 'pc', 'pa'])
  })
  it('counts "Met again" (an older dog seen again rises to the top)', () => {
    const dogs = [dog('a', { primaryPhotoId: 'pa', lastMetAt: 100 }), dog('b', { primaryPhotoId: 'pb', lastMetAt: 200 })]
    dogs[0].lastMetAt = 500
    expect(stackPhotoIds(dogs)[0]).toBe('pa')
  })
  it('skips dogs without a photo and caps the stack at three', () => {
    const dogs = [dog('a', { primaryPhotoId: 'pa', lastMetAt: 1 }), dog('b', { lastMetAt: 9 }), ...['c', 'd', 'e'].map((x, i) => dog(x, { primaryPhotoId: 'p' + x, lastMetAt: 10 + i }))]
    expect(stackPhotoIds(dogs)).toEqual(['pe', 'pd', 'pc'])
  })
  it('is empty when no dog has a photo', () => {
    expect(stackPhotoIds([dog('a'), dog('b')])).toEqual([])
  })
  it('breaks ties by when the dog was added, newest first', () => {
    expect(stackPhotoIds([dog('a', { primaryPhotoId: 'pa', createdAt: 1 }), dog('b', { primaryPhotoId: 'pb', createdAt: 2 })])).toEqual(['pb', 'pa'])
  })
})

describe('Dogdex tiles', () => {
  const snapshot: Snapshot = {
    dogs: [
      dog('a', { primaryPhotoId: 'pa', lastMetAt: 100 }),
      dog('b', { primaryPhotoId: 'pb', lastMetAt: 300 }),
      dog('c', { breedId: 'beagle', lastMetAt: 50 }), // met, but no photo: keeps the silhouette
      dog('d', { breedId: null, customBreedLabel: 'Pug', customGroupId: 'toy', primaryPhotoId: 'pd' }),
    ],
    encounters: [], guesses: [], awards: [], stickers: [],
  }
  const view = () =>
    render(
      <MemoryRouter>
        <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
          <DogdexPage />
        </DataContext.Provider>
      </MemoryRouter>,
    )

  it('stacks photos on a breed with photos, and keeps the silhouette on one without', async () => {
    const { container, getByRole } = view()
    const frenchie = getByRole('link', { name: /French Bulldog/ })
    const stack = frenchie.querySelector('.photo-stack')
    expect(stack).not.toBeNull()
    expect(stack!.querySelectorAll('.photo-stack__item')).toHaveLength(2)
    expect(frenchie.querySelector('svg.silhouette')).toBeNull()

    const beagle = getByRole('link', { name: /Beagle/ })
    expect(beagle.querySelector('.photo-stack')).toBeNull()
    expect(beagle.querySelector('svg.silhouette')).not.toBeNull()

    const pug = getByRole('link', { name: /Pug/ })
    expect(pug.querySelectorAll('.photo-stack__item')).toHaveLength(1)

    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('draws the newest dog last in the DOM (on top)', () => {
    const { getByRole } = view()
    const items = getByRole('link', { name: /French Bulldog/ }).querySelectorAll('.photo-stack__item')
    expect((items[items.length - 1] as HTMLElement).className).toContain('photo-stack__item--0')
    expect((items[items.length - 1] as HTMLElement).style.zIndex).toBe('3')
  })
})
