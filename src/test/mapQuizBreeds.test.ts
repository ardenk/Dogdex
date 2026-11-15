import { describe, expect, it } from 'vitest'
import { listPairs, mapQuizBreeds, serializeQuizImages } from '../../scripts/lib/mapQuizBreeds'
import { breedsById, data, quizPaths, quizPhotos } from '../data'
import type { Breed } from '../data'

const breed = (id: string, name: string, aliases: string[] = []): Breed => ({
  id, entry: 1, name, aliases, groupId: 'hound', origin: '', rarity: 'common', temperament: [], summary: 's', traits: [], tags: [],
})
const breeds = [breed('afghan-hound', 'Afghan Hound'), breed('beagle', 'Beagle'), breed('border-collie', 'Border Collie'), breed('airedale-terrier', 'Airedale Terrier', ['Airedale']), breed('australian-kelpie', 'Australian Kelpie', ['Kelpie'])]

describe('listPairs', () => {
  it('makes one entry per photo set, with a path as Dog CEO spells it', () => {
    expect(listPairs({ beagle: [], hound: ['afghan', 'basset'] })).toEqual([
      { main: 'beagle', path: 'beagle' },
      { main: 'hound', sub: 'afghan', path: 'hound/afghan' },
      { main: 'hound', sub: 'basset', path: 'hound/basset' },
    ])
  })
})

describe('mapQuizBreeds', () => {
  const map = (all: Record<string, string[]>, overrides: Record<string, string> = {}) => mapQuizBreeds(listPairs(all), breeds, overrides)

  it('matches "sub main" and "main sub" names, and plain names', () => {
    const r = map({ hound: ['afghan'], beagle: [], collie: ['border'] })
    expect(r.mapped).toEqual([
      { breedId: 'afghan-hound', path: 'hound/afghan' },
      { breedId: 'beagle', path: 'beagle' },
      { breedId: 'border-collie', path: 'collie/border' },
    ])
  })

  it('uses a manual override when the names differ, and the override wins over a name match', () => {
    expect(map({ airedale: [] }).mapped).toEqual([{ breedId: 'airedale-terrier', path: 'airedale' }]) // via alias
    expect(map({ beagle: [] }, { beagle: 'afghan-hound' }).mapped).toEqual([{ breedId: 'afghan-hound', path: 'beagle' }])
  })

  it('reports Dog CEO photo sets we have no breed for, without failing', () => {
    const r = map({ dhole: [], beagle: [] })
    expect(r.unmatched.map((p) => p.path)).toEqual(['dhole'])
    expect(r.mapped).toHaveLength(1)
  })

  it('flags matches made on the sub-breed name alone, and only maps a breed once', () => {
    const r = map({ australian: ['kelpie'], kelpie: [] })
    expect(r.mapped).toEqual([{ breedId: 'australian-kelpie', path: 'australian/kelpie' }])
    expect(r.duplicates).toEqual([{ path: 'kelpie', breedId: 'australian-kelpie' }])
    expect(r.looseMatches).toEqual([])
    expect(map({ spaniel: ['kelpie'] }).looseMatches).toEqual([{ path: 'spaniel/kelpie', breedId: 'australian-kelpie' }])
  })

  it('leaves a photo set out on purpose when its override is empty, without calling it a problem', () => {
    const r = map({ mix: [], beagle: [] }, { mix: '' })
    expect(r.mapped).toEqual([{ breedId: 'beagle', path: 'beagle' }])
    expect(r.leftOut).toEqual(['mix'])
    expect(r.unmatched).toEqual([])
    expect(r.badOverrides).toEqual([])
  })

  it('reports overrides that point at a missing breed or photo set', () => {
    const r = map({ beagle: [] }, { 'nope/none': 'beagle', beagle: 'not-a-breed' })
    expect(r.badOverrides).toHaveLength(2)
  })

  it('sorts by breed id so a re-run changes nothing', () => {
    const a = map({ beagle: [], hound: ['afghan'] })
    const b = map({ hound: ['afghan'], beagle: [] })
    expect(serializeQuizImages(a.mapped)).toBe(serializeQuizImages(b.mapped))
  })
})

describe('the quiz photo mapping in the data files', () => {
  it('covers well over a hundred breeds, each one a real breed, once', () => {
    expect(data.quizImages.length).toBeGreaterThan(150)
    expect(new Set(data.quizImages.map((q) => q.breedId)).size).toBe(data.quizImages.length)
    for (const q of data.quizImages) expect(breedsById[q.breedId]).toBeTruthy()
  })

  it('includes the everyday breeds, with sensible paths', () => {
    expect(quizPaths['labrador-retriever']).toBe('labrador')
    expect(quizPaths['beagle']).toBe('beagle')
    expect(quizPaths['bernese-mountain-dog']).toBe('mountain/bernese')
    expect(quizPaths['doberman-pinscher']).toBe('doberman')
  })

  it('includes the five breeds mapped by hand after review', () => {
    expect(quizPaths['griffon-bruxellois']).toBe('brabancon')
    expect(quizPaths['black-and-tan-coonhound']).toBe('coonhound')
    expect(quizPaths['belgian-shepherd']).toBe('groenendael')
    expect(quizPaths['pyrenean-mountain-dog']).toBe('pyrenees')
    expect(quizPaths['cavalier-king-charles-spaniel']).toBe('spaniel/blenheim')
  })

  it('records how many photos each breed has', () => {
    for (const q of data.quizImages) expect(q.photos, q.breedId).toBeGreaterThan(0)
    expect(quizPhotos['labrador-retriever']).toBeGreaterThan(100)
  })

  it('leaves out Mixed breed, whose photos are random mixed dogs', () => {
    expect(quizPaths['mixed-breed']).toBeUndefined()
  })

  it('leaves out breeds Dog CEO has no photos for', () => {
    expect(quizPaths['phu-quoc-ridgeback']).toBeUndefined()
    expect(Object.keys(quizPaths).length).toBeLessThan(data.breeds.length / 2)
  })
})
