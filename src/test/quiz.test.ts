import { describe, expect, it } from 'vitest'
import { data, quizPaths, quizPhotos } from '../data'
import type { Breed } from '../data'
import { computeStats, evaluateBadges } from '../domain/badges/engine'
import { applyRound, buildRound, choicesFor, confusable, EMPTY_QUIZ_STATS, FEW_PHOTOS, MIN_MET_TO_QUIZ, photoWeight, poolForMode, quizPool, readQuizStats, scoreMessage, seededRng } from '../domain/quiz'
import type { Snapshot } from '../domain/types'

const pool = quizPool(data.breeds, quizPaths)
const byId = (id: string) => data.breeds.find((b) => b.id === id) as Breed
const empty: Snapshot = { dogs: [], encounters: [], guesses: [], awards: [], stickers: [] }

describe('buildRound', () => {
  const round = (seed = 1, over: Partial<Parameters<typeof buildRound>[0]> = {}) => buildRound({ pool, mode: { kind: 'any' }, rng: seededRng(seed), ...over })

  it('asks ten different breeds, each with four unique options that include the right one', () => {
    const qs = round()
    expect(qs).toHaveLength(10)
    expect(new Set(qs.map((q) => q.breedId)).size).toBe(10)
    for (const q of qs) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[q.correctIndex]).toBe(q.breedId)
      for (const id of q.options) expect(quizPaths[id]).toBeTruthy() // every option is a breed we could show
    }
  })

  it('is repeatable with the same seed and different with another', () => {
    expect(round(7)).toEqual(round(7))
    expect(round(7)).not.toEqual(round(8))
  })

  it('prefers look-alikes from the same category for the wrong answers', () => {
    const hound = pool.filter((b) => b.groupId === 'hound').length
    expect(hound).toBeGreaterThan(10)
    for (const q of round(3, { mode: { kind: 'group', groupId: 'hound' } })) {
      for (const id of q.options) expect(byId(id).groupId).toBe('hound')
    }
  })

  it('never offers two breeds a player could fairly mix up by name', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const q of round(seed)) {
        const breeds = q.options.map(byId)
        for (const a of breeds) for (const b of breeds) if (a !== b) expect(confusable(a, b), `${a.name} / ${b.name}`).toBe(false)
      }
    }
  })

  it('"met" mode only asks about breeds you have met, but may use any breed as a wrong answer', () => {
    const met = new Set(['beagle', 'akita', 'boxer', 'pug', 'dalmatian'].filter((id) => quizPaths[id]))
    const qs = round(2, { mode: { kind: 'met' }, metBreedIds: met })
    expect(qs).toHaveLength(met.size)
    for (const q of qs) expect(met.has(q.breedId)).toBe(true)
    expect(qs.some((q) => q.options.some((id) => !met.has(id)))).toBe(true)
  })

  it('gives a shorter round for a small pool and nothing for an empty one', () => {
    const tiny = pool.filter((b) => ['beagle', 'akita', 'boxer'].includes(b.id))
    const qs = buildRound({ pool: tiny, mode: { kind: 'any' }, rng: seededRng(1) })
    expect(qs).toHaveLength(3)
    expect(qs[0].options.length).toBe(3) // only three breeds exist, so only three options
    expect(buildRound({ pool: [], mode: { kind: 'any' } })).toEqual([])
    expect(buildRound({ pool: tiny.slice(0, 1), mode: { kind: 'any' } })).toEqual([]) // one breed cannot make a question
  })
})

describe('breeds with very few photos', () => {
  const asked = (rounds: number, over: Partial<Parameters<typeof buildRound>[0]> = {}) => {
    const counts = new Map<string, number>()
    for (let seed = 1; seed <= rounds; seed++) {
      for (const q of buildRound({ pool, mode: { kind: 'any' }, photoCounts: quizPhotos, rng: seededRng(seed), ...over })) counts.set(q.breedId, (counts.get(q.breedId) ?? 0) + 1)
    }
    return counts
  }

  it('weighs a breed down only when it has fewer than three photos', () => {
    expect(FEW_PHOTOS).toBe(3)
    expect(photoWeight(1)).toBeLessThan(1)
    expect(photoWeight(2)).toBeLessThan(1)
    expect(photoWeight(3)).toBe(1)
    expect(photoWeight(150)).toBe(1)
    expect(photoWeight(undefined)).toBe(1) // unknown: treat as normal
  })

  it('uses the real photo counts: Dalmatian has only a couple of photos, Beagle plenty', () => {
    expect(quizPhotos['dalmatian']).toBeLessThan(FEW_PHOTOS)
    expect(quizPhotos['beagle']).toBeGreaterThan(50)
  })

  it('asks about a thin breed much less often than a well-photographed one, but still sometimes', () => {
    const counts = asked(600)
    const thin = counts.get('dalmatian') ?? 0
    const normal = counts.get('beagle') ?? 0
    expect(thin).toBeGreaterThan(0)
    expect(thin).toBeLessThan(normal * 0.5)
  })

  it('treats every breed alike when no photo counts are given', () => {
    const counts = asked(600, { photoCounts: undefined })
    const ratio = (counts.get('dalmatian') ?? 0) / (counts.get('beagle') ?? 1)
    expect(ratio).toBeGreaterThan(0.6)
  })

  it('never leaves a thin breed out when the pool is small (met mode asks about every breed you have met)', () => {
    const met = new Set(['dalmatian', 'beagle', 'akita', 'boxer'])
    const qs = buildRound({ pool, mode: { kind: 'met' }, metBreedIds: met, photoCounts: quizPhotos, rng: seededRng(4) })
    expect(qs.map((q) => q.breedId).sort()).toEqual([...met].sort())
  })

  it('still offers a thin breed as a wrong answer (that shows only a name)', () => {
    let seen = false
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      seen = buildRound({ pool, mode: { kind: 'group', groupId: 'non-sporting' }, photoCounts: quizPhotos, rng: seededRng(seed) }).some((q) => q.breedId !== 'dalmatian' && q.options.includes('dalmatian'))
    }
    expect(seen).toBe(true)
  })
})

describe('the hardest round (no choices)', () => {
  it('offers no answers for the search format and four for the normal one', () => {
    expect(choicesFor('search')).toBe(1)
    expect(choicesFor('choices')).toBe(4)
  })

  it('asks the same ten breeds in the same order as the normal round for a given seed, but with nothing to pick from', () => {
    const hard = buildRound({ pool, mode: { kind: 'any' }, photoCounts: quizPhotos, choices: 1, rng: seededRng(11) })
    const easy = buildRound({ pool, mode: { kind: 'any' }, photoCounts: quizPhotos, choices: 4, rng: seededRng(11) })
    expect(hard.map((q) => q.breedId)).toEqual(easy.map((q) => q.breedId))
    expect(hard).toHaveLength(10)
    for (const q of hard) expect(q).toEqual({ breedId: q.breedId, options: [q.breedId], correctIndex: 0 })
  })

  it('still works for a pool too small to make wrong answers from', () => {
    const one = pool.filter((b) => b.id === 'beagle')
    expect(buildRound({ pool: one, mode: { kind: 'any' }, choices: 1, rng: seededRng(1) })).toHaveLength(1)
  })
})

describe('confusable', () => {
  it('flags names that contain one another, ignoring size notes in brackets', () => {
    expect(confusable(byId('poodle'), byId('poodle-toy'))).toBe(true)
    expect(confusable(byId('bulldog'), byId('french-bulldog'))).toBe(true)
    expect(confusable(byId('beagle'), byId('border-collie'))).toBe(false)
    expect(confusable(byId('golden-retriever'), byId('labrador-retriever'))).toBe(false)
  })
})

describe('pools', () => {
  it('limits a round to one category or to met breeds', () => {
    expect(poolForMode(pool, { kind: 'group', groupId: 'toy' }, new Set()).every((b) => b.groupId === 'toy')).toBe(true)
    expect(poolForMode(pool, { kind: 'met' }, new Set(['beagle'])).map((b) => b.id)).toEqual(['beagle'])
    expect(poolForMode(pool, { kind: 'any' }, new Set())).toBe(pool)
  })
  it('has enough variety in every category that is big enough to quiz', () => {
    expect(MIN_MET_TO_QUIZ).toBe(4)
    expect(data.groups.filter((g) => pool.filter((b) => b.groupId === g.id).length >= 10).length).toBeGreaterThanOrEqual(5)
  })
})

describe('quiz stats', () => {
  it('adds a finished round to the lifetime totals and tracks the best round', () => {
    const one = applyRound(EMPTY_QUIZ_STATS, { answered: 10, correct: 7 })
    expect(one).toEqual({ rounds: 1, answered: 10, correct: 7, best: 7 })
    expect(applyRound(one, { answered: 10, correct: 4 })).toEqual({ rounds: 2, answered: 20, correct: 11, best: 7 })
    expect(applyRound(one, { answered: 6, correct: 6 }).best).toBe(7)
  })

  it('reads saved totals safely', () => {
    expect(readQuizStats({ rounds: 1, answered: 10, correct: 7, best: 7 })).toEqual({ rounds: 1, answered: 10, correct: 7, best: 7 })
    expect(readQuizStats(undefined)).toEqual(EMPTY_QUIZ_STATS)
    expect(readQuizStats({ rounds: 1.5, answered: -1, correct: 'x', best: null })).toEqual(EMPTY_QUIZ_STATS)
  })

  it('has a kind message for every score and never shames', () => {
    for (const c of [0, 3, 5, 8, 10]) expect(scoreMessage(c, 10).length).toBeGreaterThan(10)
    expect(scoreMessage(0, 10)).not.toMatch(/fail|bad|wrong|poor/i)
    expect(scoreMessage(0, 0)).toBe('No questions this time.')
  })
})

describe('Quiz whiz badge', () => {
  const badge = data.badges.find((b) => b.id === 'quiz-whiz')

  it('exists and asks for 25 right answers', () => {
    expect(badge?.rule).toEqual({ type: 'quiz_correct_count', gte: 25 })
  })

  it('is earned from the saved quiz totals and shows progress before that', () => {
    const at = (correct: number) => evaluateBadges(data.badges, computeStats(empty, data.breeds, { rounds: 3, answered: 30, correct, best: 8 })).find((p) => p.badge.id === 'quiz-whiz')
    expect(at(10)).toMatchObject({ earned: false, current: 10, target: 25 })
    expect(at(25)).toMatchObject({ earned: true })
    expect(evaluateBadges(data.badges, computeStats(empty, data.breeds)).find((p) => p.badge.id === 'quiz-whiz')).toMatchObject({ earned: false, current: 0 })
  })
})
