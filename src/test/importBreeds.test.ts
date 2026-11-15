import { describe, expect, it } from 'vitest'
import { buildBreeds, classifyGroup, serializeBreeds, slug } from '../../scripts/lib/importBreeds'
import type { ApiBreed } from '../../scripts/lib/importBreeds'
import { breedsById, data, entryNumber } from '../data'
import type { Breed } from '../data'

const base = (over: Partial<Breed>): Breed => ({
  id: 'x', entry: 1, name: 'X', aliases: [], groupId: 'sporting', origin: '', rarity: 'common', temperament: [], summary: 's', traits: [], tags: [], ...over,
})

const groupOrder = ['sporting', 'hound', 'working', 'terrier', 'toy', 'non-sporting', 'herding', 'mixed']
const groupNames = { sporting: 'Sporting', hound: 'Hound', working: 'Working', terrier: 'Terrier', toy: 'Toy', 'non-sporting': 'Non-Sporting', herding: 'Herding', mixed: 'Mixed & Designer' }
const run = (api: ApiBreed[], existing: Breed[] = [], rarityOverrides: Record<string, string> = {}) =>
  buildBreeds({ api, existing, groupOrder, groupNames, rarityOverrides })

describe('classifyGroup', () => {
  it('passes the AKC group names through', () => {
    expect(classifyGroup('Terrier')).toEqual({ groupId: 'terrier', odd: false })
    expect(classifyGroup('Non-Sporting')).toEqual({ groupId: 'non-sporting', odd: false })
    expect(classifyGroup('Mixed')).toEqual({ groupId: 'mixed', odd: false })
  })

  it('files unusual API groups under the nearest one and marks them for the report', () => {
    expect(classifyGroup('Sighthound')).toEqual({ groupId: 'hound', odd: true })
    expect(classifyGroup('Guardian')).toEqual({ groupId: 'working', odd: true })
    expect(classifyGroup('Pastoral/Herding')).toEqual({ groupId: 'herding', odd: true })
  })

  it('never throws on a missing or brand-new group', () => {
    expect(classifyGroup(null)).toEqual({ groupId: 'non-sporting', odd: true })
    expect(classifyGroup('Something New')).toEqual({ groupId: 'non-sporting', odd: true })
  })
})

describe('buildBreeds', () => {
  const lab = base({ id: 'labrador-retriever', entry: 1, name: 'Labrador Retriever', aliases: ['lab'], rarity: 'common', summary: 'Hand-written.', traits: ['otter tail'] })

  it('never changes a breed you already have, apart from adding search aliases', () => {
    const { breeds, added } = run([{ name: 'Labrador Retriever', alt_names: 'Labrador, Lab', breed_group: 'Sporting', description: 'API text.' }], [lab])
    expect(added).toHaveLength(0)
    expect(breeds[0]).toMatchObject({ id: 'labrador-retriever', entry: 1, summary: 'Hand-written.', traits: ['otter tail'], rarity: 'common' })
    expect(breeds[0].aliases).toEqual(['lab', 'Labrador'])
  })

  it('matches an existing breed by one of its aliases and never creates a second entry for it', () => {
    const { added, report } = run([{ name: 'Lab', breed_group: 'Sporting' }], [lab])
    expect(added).toHaveLength(0)
    expect(report.matched).toEqual([['labrador-retriever', 'Lab']])
  })

  it('gives new breeds the next free numbers, in group then name order, leaving existing numbers alone', () => {
    const { breeds, added } = run(
      [
        { name: 'Zebra Hound', breed_group: 'Hound' },
        { name: 'Aardvark Retriever', breed_group: 'Sporting' },
        { name: 'Basenji', breed_group: 'Hound' },
      ],
      [lab],
    )
    expect(added.map((b) => [b.name, b.entry])).toEqual([['Aardvark Retriever', 2], ['Basenji', 3], ['Zebra Hound', 4]])
    expect(breeds[0].entry).toBe(1)
  })

  it('is stable: running it again on its own output adds nothing and changes nothing', () => {
    const api: ApiBreed[] = [{ name: 'Basenji', breed_group: 'Hound', alt_names: 'Congo Dog', origin: 'Africa', temperament: 'alert, curious' }]
    const first = run(api, [lab])
    const second = run(api, first.breeds)
    expect(second.added).toHaveLength(0)
    expect(serializeBreeds(second.breeds)).toBe(serializeBreeds(first.breeds))
  })

  it('builds a complete entry from sparse API data', () => {
    const { added } = run([{ name: 'Lài', breed_group: 'Primitive', alt_names: 'Lai Dog; Lai', origin: 'Vietnam', temperament: 'loyal, wary', description: '' }])
    expect(added[0]).toMatchObject({
      id: 'lai',
      groupId: 'hound',
      origin: 'Vietnam',
      temperament: ['Loyal', 'Wary'],
      traits: [],
      summary: 'A hound breed from Vietnam.',
    })
    // The plain-letter spelling is searchable, and an alias equal to the name is not repeated.
    expect(added[0].aliases).toContain('Lai Dog')
    expect(added[0].aliases).not.toContain('Lai')
  })

  it('keeps ids unique when two breeds would share one', () => {
    const { added, report } = run([
      { name: 'Caucasian Shepherd Dog', breed_group: 'Working' },
      { name: 'Caucasian Shepherd Dog', breed_group: 'Guardian' },
    ])
    expect(new Set(added.map((b) => b.id)).size).toBe(added.length)
    expect(report.renamedIds.length).toBeGreaterThan(0)
  })

  it('adds "Miniature Poodle" as a search word for "Poodle (Miniature)"', () => {
    const { added } = run([{ name: 'Poodle (Miniature)', breed_group: 'Non-Sporting' }])
    expect(added[0].id).toBe('poodle-miniature')
    expect(added[0].aliases).toContain('Miniature Poodle')
  })

  it('sets rarity: uncommon by default, rare for non-AKC groups, and your overrides win', () => {
    const { added } = run(
      [
        { name: 'Pug', breed_group: 'Toy' },
        { name: 'Africanis', breed_group: 'Primitive' },
        { name: 'American Bully', breed_group: 'Companion' },
        { name: 'Azawakh', breed_group: 'Hound' },
      ],
      [],
      { 'Pug': 'common', 'American Bully': 'common', Azawakh: 'rare' },
    )
    const rarity = Object.fromEntries(added.map((b) => [b.name, b.rarity]))
    expect(rarity).toEqual({ Pug: 'common', Africanis: 'rare', 'American Bully': 'common', Azawakh: 'rare' })
  })

  it('tags doodles and poodle mixes so the doodle badge keeps working', () => {
    const { added } = run([
      { name: 'Bernedoodle', breed_group: 'Mixed' },
      { name: 'Cavapoo', breed_group: 'Mixed' },
      { name: 'Golden Retriever Cross', breed_group: 'Mixed' },
    ])
    const tags = Object.fromEntries(added.map((b) => [b.name, b.tags]))
    expect(tags.Bernedoodle).toEqual(['doodle', 'poodle-mix'])
    expect(tags.Cavapoo).toEqual(['poodle-mix'])
    expect(tags['Golden Retriever Cross']).toContain('retriever')
  })

  it('lets an alias point at only one breed', () => {
    const { breeds, report } = run([
      { name: 'Beagle', breed_group: 'Hound', alt_names: 'English Beagle' },
      { name: 'Harrier', breed_group: 'Hound', alt_names: 'English Beagle, Hare Hound' },
    ])
    expect(breeds.filter((b) => b.aliases.includes('English Beagle'))).toHaveLength(1)
    expect(report.droppedAliases).toHaveLength(1)
  })

  it('skips rows without a name', () => {
    expect(run([{ id: 7, name: '  ' }, { name: 'Pug', breed_group: 'Toy' }]).added.map((b) => b.name)).toEqual(['Pug'])
  })
})

describe('slug', () => {
  it('makes readable ids', () => {
    expect(slug("Cirneco dell'Etna")).toBe('cirneco-dell-etna')
    expect(slug('Bắc Hà')).toBe('bac-ha')
    expect(slug('Black & Tan')).toBe('black-and-tan')
  })
})

describe('the imported breed list', () => {
  it('has every breed from the Dog API plus the hand-written ones, all valid', () => {
    expect(data.breeds.length).toBeGreaterThan(600)
    expect(new Set(data.breeds.map((b) => b.id)).size).toBe(data.breeds.length)
  })

  it('leaves the original 25 numbered and described as before', () => {
    expect(entryNumber['labrador-retriever']).toBe(1)
    expect(entryNumber['mixed-breed']).toBe(25)
    expect(breedsById['rhodesian-ridgeback']).toMatchObject({ rarity: 'rare', origin: expect.stringContaining('Southern Africa') })
    expect(breedsById['labrador-retriever'].traits.length).toBeGreaterThan(0)
  })

  it('files every breed under a real group with a number', () => {
    for (const b of data.breeds) {
      expect(data.groups.some((g) => g.id === b.groupId)).toBe(true)
      expect(entryNumber[b.id]).toBeGreaterThan(0)
    }
  })

  it('keeps the doodle badge reachable', () => {
    expect(data.breeds.filter((b) => b.tags.includes('doodle')).length).toBeGreaterThan(10)
  })
})
