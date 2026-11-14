import { describe, expect, it } from 'vitest'
import { breedsById, data } from '../data'
import { parseData } from '../data/schema'
import { computeStats, evaluateBadges, newlyEarned } from '../domain/badges/engine'
import { countThisWeek, goalMessage, startOfWeek } from '../domain/goals'
import { guessAccuracy, isGuessCorrect } from '../domain/guess'
import { searchBreeds } from '../domain/search'
import type { Dog, Encounter, Guess, Snapshot } from '../domain/types'
import { labelFromAddress, roundCoord, toGeoCell } from '../services/location'

const base = { createdAt: 0, updatedAt: 0 }
const dog = (id: string, breedId: string): Dog => ({ ...base, id, breedId, firstMetAt: 0, lastMetAt: 0 })
const snap = (dogs: Dog[], guesses: Guess[] = []): Snapshot => ({ dogs, encounters: [], guesses, awards: [], stickers: [] })
const guess = (id: string, correct: boolean | null): Guess => ({
  ...base, id, encounterId: 'e', dogId: 'd', guessedBreedId: 'beagle', suggestions: [], confirmedBreedId: 'beagle', correct, identifierId: 'mock-v1', createdAt: Number(id),
})

describe('data files', () => {
  it('validate and cross-reference', () => {
    expect(data.breeds.length).toBeGreaterThanOrEqual(20)
    expect(data.groups.map((g) => g.id)).toContain('mixed')
  })
  it('have at least 3 breeds in every AKC group so "Completed a group" is reachable', () => {
    for (const g of data.groups.filter((g) => g.id !== 'mixed')) {
      expect(data.breeds.filter((b) => b.groupId === g.id).length).toBeGreaterThanOrEqual(3)
    }
  })
  it('reject unknown group references', () => {
    expect(() =>
      parseData({
        groups: [{ id: 'a', name: 'A', order: 1, blurb: '' }],
        rarities: [{ id: 'common', label: 'C', glyph: '●', order: 1, celebration: 'none', message: '' }],
        breeds: [{ ...data.breeds[0], groupId: 'nope', rarity: 'common' }],
        badges: [],
      }),
    ).toThrow(/unknown group/)
  })
})

describe('badges', () => {
  const evalAll = (s: Snapshot) => evaluateBadges(data.badges, computeStats(s, data.breeds))
  const earned = (s: Snapshot) => evalAll(s).filter((p) => p.earned).map((p) => p.badge.id)

  it('awards First dog on the first dog', () => {
    expect(earned(snap([]))).toEqual([])
    expect(earned(snap([dog('1', 'beagle')]))).toContain('first-dog')
  })
  it('counts distinct doodle dogs, including repeats of one breed', () => {
    const doodles = Array.from({ length: 10 }, (_, i) => dog(String(i), i % 2 ? 'goldendoodle' : 'labradoodle'))
    expect(earned(snap(doodles))).toContain('doodle-fan')
    expect(earned(snap(doodles.slice(0, 9)))).not.toContain('doodle-fan')
  })
  it('completes a group only when every breed in it is logged, and ignores the mixed group', () => {
    const toy = data.breeds.filter((b) => b.groupId === 'toy')
    const partial = toy.slice(1).map((b, i) => dog(String(i), b.id))
    expect(earned(snap(partial))).not.toContain('group-complete')
    const full = toy.map((b, i) => dog(String(i), b.id))
    expect(earned(snap(full))).toContain('group-complete')
    const mixed = data.breeds.filter((b) => b.groupId === 'mixed').map((b, i) => dog(String(i), b.id))
    expect(earned(snap(mixed))).not.toContain('group-complete')
  })
  it('counts rare finds as dogs of rare breeds', () => {
    const rare = data.breeds.filter((b) => b.rarity === 'rare')
    expect(rare.length).toBeGreaterThanOrEqual(3)
    expect(earned(snap(rare.slice(0, 2).map((b, i) => dog(String(i), b.id))))).not.toContain('rare-finds-3')
    expect(earned(snap(rare.slice(0, 3).map((b, i) => dog(String(i), b.id))))).toContain('rare-finds-3')
  })
  it('counts correct guesses only', () => {
    const ten = Array.from({ length: 10 }, (_, i) => guess(String(i), true))
    expect(earned(snap([], ten))).toContain('guessed-10')
    expect(earned(snap([], [...ten.slice(0, 9), guess('x', false), guess('y', null)]))).not.toContain('guessed-10')
  })
  it('reports progress and only newly earned badges', () => {
    const p = evalAll(snap([dog('1', 'beagle')]))
    const ten = p.find((x) => x.badge.id === 'ten-dogs')!
    expect([ten.current, ten.target, ten.earned]).toEqual([1, 10, false])
    expect(newlyEarned(p, new Set(['first-dog'])).map((b) => b.id)).toEqual([])
    expect(newlyEarned(p, new Set()).map((b) => b.id)).toEqual(['first-dog'])
  })
})

describe('weekly goal', () => {
  const enc = (metAt: number): Encounter => ({ ...base, id: String(metAt), dogId: 'd', metAt })
  const wed = new Date(2026, 10, 4, 12) // Wed 4 Nov 2026
  it('starts the week on Monday', () => {
    expect(startOfWeek(wed).getDate()).toBe(2)
    expect(startOfWeek(new Date(2026, 10, 8, 23)).getDate()).toBe(2) // Sunday still belongs to that week
    expect(startOfWeek(wed, 0).getDate()).toBe(1)
  })
  it('counts only this week, including repeat encounters', () => {
    const list = [enc(new Date(2026, 10, 2, 1).getTime()), enc(wed.getTime()), enc(wed.getTime() + 1), enc(new Date(2026, 10, 1, 23).getTime()), enc(new Date(2026, 10, 9).getTime())]
    expect(countThisWeek(list, wed)).toBe(3)
  })
  it('never guilt-trips', () => {
    expect(goalMessage(0, 5)).not.toMatch(/miss|streak|fail|lost/i)
    expect(goalMessage(4, 5)).toMatch(/one more/i)
    expect(goalMessage(5, 5)).toMatch(/reached/i)
  })
})

describe('guess tracking', () => {
  it('scores a guess against the confirmed breed', () => {
    expect(isGuessCorrect('beagle', 'beagle')).toBe(true)
    expect(isGuessCorrect('beagle', 'dachshund')).toBe(false)
    expect(isGuessCorrect(null, 'beagle')).toBeNull()
  })
  it('summarizes accuracy, ignoring skipped guesses', () => {
    const a = guessAccuracy([guess('1', true), guess('2', false), guess('3', null), guess('4', true)])
    expect([a.made, a.correct]).toEqual([3, 2])
    expect(a.rate).toBeCloseTo(2 / 3)
    expect(a.recent).toEqual([true, false, true])
    expect(guessAccuracy([]).rate).toBeNull()
  })
})

describe('breed search', () => {
  const find = (q: string) => searchBreeds(data.breeds, q).map((b) => b.id)
  it('matches names, prefixes and aliases', () => {
    expect(find('lab')[0]).toBe('labrador-retriever')
    expect(find('frenchie')[0]).toBe('french-bulldog')
    expect(find('westie')[0]).toBe('west-highland-white-terrier')
    expect(find('JACK russell')[0]).toBe('parson-russell-terrier')
  })
  it('finds doodles', () => {
    expect(find('doodle')).toEqual(expect.arrayContaining(['goldendoodle', 'labradoodle']))
  })
  it('returns nothing for empty or unknown queries', () => {
    expect(find('')).toEqual([])
    expect(find('zzzzz')).toEqual([])
  })
  it('knows every breed exists', () => {
    expect(breedsById['rhodesian-ridgeback'].rarity).toBe('rare')
  })
})

describe('location privacy', () => {
  it('rounds coordinates to ~1 km', () => {
    expect(roundCoord(40.71987)).toBe(40.72)
    expect(toGeoCell(40.71987, -74.00612)).toBe('40.72,-74.01')
  })
  it('builds neighborhood-level labels, never street addresses', () => {
    expect(labelFromAddress({ neighbourhood: 'Tribeca', city: 'New York', road: 'Hudson St', house_number: '12' })).toBe('Tribeca, New York')
    expect(labelFromAddress({ suburb: 'Harlem', city: 'Harlem' })).toBe('Harlem')
    expect(labelFromAddress({ town: 'Scarsdale', county: 'Westchester County' })).toBe('Scarsdale')
    expect(labelFromAddress({})).toBeUndefined()
  })
})
