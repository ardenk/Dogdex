import { describe, expect, it } from 'vitest'
import { data, entryNumber } from '../data'
import { parseData } from '../data/schema'
import { resolveBreedId } from '../services/identify'
import { parsePredictions } from '../services/identify/cloud'
import { identifyStatus, identifyStatusMessage } from '../services/identify/status'

describe('identifyStatus', () => {
  const ok = { cloudEnabled: true, signedIn: true, optedIn: true, online: true }

  it('sends a photo only when cloud is set up, the user opted in, is signed in, and is online', () => {
    expect(identifyStatus(ok)).toBe('on')
    expect(identifyStatus({ ...ok, optedIn: false })).toBe('off')
    expect(identifyStatus({ ...ok, signedIn: false })).toBe('sign-in')
    expect(identifyStatus({ ...ok, online: false })).toBe('offline')
    expect(identifyStatus({ ...ok, cloudEnabled: false })).toBe('unavailable')
  })

  it('treats "not opted in" as the answer even when signed out, so the photo never leaves by accident', () => {
    expect(identifyStatus({ ...ok, optedIn: false, signedIn: false })).toBe('off')
  })

  it('explains every reason a photo is not sent, and says nothing when it is', () => {
    expect(identifyStatusMessage('on')).toBeNull()
    for (const s of ['off', 'sign-in', 'offline', 'unavailable'] as const) expect(identifyStatusMessage(s)).toMatch(/Pick the breed/)
  })
})

describe('parsePredictions', () => {
  it('keeps well-formed predictions and clamps confidence into 0..1', () => {
    expect(parsePredictions({ predictions: [{ breed: 'Beagle', confidence: 1.4 }, { breed: 'Pug', confidence: -1 }] })).toEqual([
      { breed: 'Beagle', confidence: 1 },
      { breed: 'Pug', confidence: 0 },
    ])
  })

  it('rejects a response that is not the expected shape', () => {
    expect(() => parsePredictions({ predictions: [{ breed: 5 }] })).toThrow()
    expect(() => parsePredictions('nope')).toThrow()
  })
})

describe('mapping Cloud Vision labels to Dogdex breeds', () => {
  it('matches labels by name, case-insensitively, and by alias', () => {
    expect(resolveBreedId('Golden retriever')).toBe('golden-retriever')
    expect(resolveBreedId('Labrador Retriever')).toBe('labrador-retriever')
    expect(resolveBreedId('lab')).toBe('labrador-retriever')
  })

  it('drops labels that are not a breed we have', () => {
    expect(resolveBreedId('Snout')).toBeUndefined()
    expect(resolveBreedId('Some rare breed nobody listed')).toBeUndefined()
  })
})

describe('Dogdex entry numbers', () => {
  it('keeps the numbers the first 25 breeds already had', () => {
    expect(entryNumber['labrador-retriever']).toBe(1)
    expect(entryNumber['rhodesian-ridgeback']).toBe(6)
    expect(Object.values(entryNumber).sort((a, b) => a - b).slice(0, 25)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
  })

  it('gives every breed its own number', () => {
    const numbers = Object.values(entryNumber)
    expect(new Set(numbers).size).toBe(data.breeds.length)
  })

  it('rejects two breeds that claim the same number', () => {
    const raw = { groups: [{ id: 'g', name: 'G', order: 1, blurb: '' }], rarities: [{ id: 'common', label: 'C', glyph: '●', order: 1, celebration: 'none', message: '' }], badges: [] }
    const breed = (id: string, entry: number) => ({ id, entry, name: id, aliases: [], groupId: 'g', origin: '', rarity: 'common', temperament: [], summary: 's', traits: [], tags: [] })
    expect(() => parseData({ ...raw, breeds: [breed('a', 1), breed('b', 1)] })).toThrow(/share entry number 1/)
    expect(() => parseData({ ...raw, breeds: [breed('a', 1), breed('b', 2)] })).not.toThrow()
  })
})
