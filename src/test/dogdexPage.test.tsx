import { fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { data } from '../data'
import { groupTiles, indexDogs, orderTiles, searchTiles, uncategorizedTiles } from '../domain/dogdexTiles'
import type { Dog, Snapshot } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { BreedPage } from '../features/breed/BreedPage'
import { DogdexPage } from '../features/dogdex/DogdexPage'
import { GroupPage } from '../features/dogdex/GroupPage'
import { DataContext } from '../storage/data-context'

const dog = (id: string, over: Partial<Dog> = {}): Dog => ({ id, breedId: 'beagle', firstMetAt: 1, lastMetAt: 1, createdAt: 1, updatedAt: 1, ...over })

// Three hound breeds met (Dachshund most recently), one custom Terrier, one deleted dog.
const dogs: Dog[] = [
  dog('a', { breedId: 'beagle', lastMetAt: 100 }),
  dog('b', { breedId: 'dachshund', lastMetAt: 300 }),
  dog('c', { breedId: 'rhodesian-ridgeback', lastMetAt: 200 }),
  dog('d', { breedId: null, customBreedLabel: 'Bullmastiff Cross', customGroupId: 'terrier', lastMetAt: 400 }),
  dog('e', { breedId: 'basenji', lastMetAt: 999, deletedAt: 5 }),
]
const snapshot: Snapshot = { dogs, encounters: [], guesses: [], awards: [], stickers: [] }

const page = (path: string, element = <DogdexPage />, routePath = '/dogdex') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )

const cardNames = (root: HTMLElement) => [...root.querySelectorAll('.breed-card__name')].map((n) => n.textContent)

describe('dogdexTiles', () => {
  const index = indexDogs(dogs)

  it('ignores deleted dogs', () => {
    expect(index.byBreed.has('basenji')).toBe(false)
  })

  it('puts logged breeds first in a category, most recently met on top, then the rest in Dogdex order', () => {
    const names = groupTiles(data.breeds, 'hound', index).map((t) => t.name)
    expect(names.slice(0, 3)).toEqual(['Dachshund', 'Rhodesian Ridgeback', 'Beagle'])
    const unmet = data.breeds.filter((b) => b.groupId === 'hound' && !index.byBreed.has(b.id)).map((b) => b.name)
    expect(names.slice(3)).toEqual(unmet)
  })

  it('files a typed-in breed in the category you chose and counts it as logged', () => {
    const terriers = groupTiles(data.breeds, 'terrier', index)
    expect(terriers[0]).toMatchObject({ name: 'Bullmastiff Cross', kind: 'custom', count: 1 })
  })

  it('lists typed-in breeds with no category separately', () => {
    const idx = indexDogs([dog('x', { breedId: null, customBreedLabel: 'Mystery' })])
    expect(uncategorizedTiles(idx, data.groups.map((g) => g.id)).map((t) => t.name)).toEqual(['Mystery'])
    expect(uncategorizedTiles(index, data.groups.map((g) => g.id))).toEqual([])
  })

  it('keeps unmet breeds in their original order', () => {
    const tiles = orderTiles(groupTiles(data.breeds, 'toy', indexDogs([])))
    expect(tiles.map((t) => t.breed?.id)).toEqual(data.breeds.filter((b) => b.groupId === 'toy').map((b) => b.id))
  })

  it('searches listed breeds by name or nickname and your typed-in breeds', () => {
    expect(searchTiles(data.breeds, index, 'lab')[0].name).toBe('Labrador Retriever')
    expect(searchTiles(data.breeds, index, 'bullmastiff').map((t) => t.name)).toContain('Bullmastiff Cross')
    expect(searchTiles(data.breeds, index, '')).toEqual([])
  })

  it('can limit a search to one category', () => {
    const names = searchTiles(data.breeds, index, 'terrier', { groupId: 'terrier' }).map((t) => t.name)
    expect(names.length).toBeGreaterThan(5)
    for (const t of searchTiles(data.breeds, index, 'terrier', { groupId: 'terrier' })) expect(t.breed?.groupId ?? t.groupId).toBe('terrier')
  })
})

describe('Dogdex page', () => {
  it('shows one row of three cards per category, with your logged breeds first', () => {
    const { container, getByRole } = page('/dogdex')
    const hounds = getByRole('region', { name: 'Hound' })
    expect(within(hounds).getAllByRole('listitem')).toHaveLength(3)
    expect(cardNames(hounds)).toEqual(['Dachshund', 'Rhodesian Ridgeback', 'Beagle'])
    // A category with nothing logged still previews its first three breeds, in Dogdex order.
    expect(cardNames(getByRole('region', { name: 'Toy' }))).toHaveLength(3)
    // Every category shows at most one row.
    for (const section of container.querySelectorAll('section.group')) expect(section.querySelectorAll('.breed-card').length).toBeLessThanOrEqual(3)
  })

  it('links each category to a page with all of its breeds', () => {
    const { getByRole } = page('/dogdex')
    const link = getByRole('link', { name: /^Hound, 3 of 163 met/ })
    expect(link.getAttribute('href')).toBe('/dogdex/group/hound')
  })

  it('searches every breed and your own, replacing the categories with the matches', () => {
    const { getByRole, queryByRole, getByText } = page('/dogdex?q=frenchie')
    expect(cardNames(getByRole('region', { name: 'Search results' }))[0]).toBe('French Bulldog')
    expect(queryByRole('region', { name: 'Hound' })).toBeNull()
    expect(getByText(/match/)).toBeTruthy()
  })

  it('says when nothing matches', () => {
    const { getByRole } = page('/dogdex?q=zzzzqqq')
    expect(getByRole('status').textContent).toContain('No breed matches')
  })

  it('updates the results as you type, and brings the categories back when the box is cleared', () => {
    const { getByRole, queryByRole } = page('/dogdex')
    const box = getByRole('searchbox', { name: 'Search breeds' })
    fireEvent.change(box, { target: { value: 'dachs' } })
    expect(cardNames(getByRole('region', { name: 'Search results' }))[0]).toBe('Dachshund')
    fireEvent.change(box, { target: { value: '' } })
    expect(queryByRole('region', { name: 'Search results' })).toBeNull()
    expect(getByRole('region', { name: 'Hound' })).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = page('/dogdex')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('Category page', () => {
  const group = (q = '') => page(`/dogdex/group/hound${q}`, <GroupPage />, '/dogdex/group/:groupId')

  it('lists every breed in the category, logged ones first', () => {
    const { container, getByRole } = group()
    const names = cardNames(container)
    expect(names).toHaveLength(data.breeds.filter((b) => b.groupId === 'hound').length)
    expect(names.slice(0, 3)).toEqual(['Dachshund', 'Rhodesian Ridgeback', 'Beagle'])
    expect(getByRole('heading', { level: 1 }).textContent).toBe('Hound')
    expect(getByRole('link', { name: '← Dogdex' }).getAttribute('href')).toBe('/dogdex')
  })

  it('searches only within the category', () => {
    const { getByRole } = group('?q=beagle')
    const names = cardNames(getByRole('region', { name: 'Search results' }))
    expect(names).toContain('Beagle')
    for (const n of names) expect(data.breeds.find((b) => b.name === n)?.groupId).toBe('hound')
  })

  it('says so for a category that does not exist', () => {
    const { getByText } = page('/dogdex/group/nope', <GroupPage />, '/dogdex/group/:groupId')
    expect(getByText(/isn’t in the Dogdex/)).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = group()
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('Breed page', () => {
  it('no longer shows "Key identifying traits"', () => {
    const { getByRole, queryByText } = page('/dogdex/breed/labrador-retriever', <BreedPage />, '/dogdex/breed/:breedId')
    fireEvent.click(getByRole('button', { name: /Learn more/ }))
    expect(queryByText(/Key identifying traits/i)).toBeNull()
    expect(queryByText(/otter/i)).toBeNull()
    // The other details are still there.
    expect(getByRole('button', { name: /Show less/ })).toBeTruthy()
    expect(queryByText('Origin')).not.toBeNull()
  })
})
