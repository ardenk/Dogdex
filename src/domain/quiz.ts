import { z } from 'zod'
import type { Breed } from '../data/schema'
import { norm } from './search'
import type { QuizStats } from './types'

/** Pure quiz logic: choosing questions and counting results. No network, no React. Photos come from services/dogceo. */

export const EMPTY_QUIZ_STATS: QuizStats = { rounds: 0, answered: 0, correct: 0, best: 0 }

const count = z.number().int().min(0)
/** Checks the saved totals, which live in the synced settings and so could be anything. */
export const quizStatsSchema = z.object({ rounds: count, answered: count, correct: count, best: count })

export function readQuizStats(value: unknown): QuizStats {
  const parsed = quizStatsSchema.safeParse(value)
  return parsed.success ? parsed.data : { ...EMPTY_QUIZ_STATS }
}

/** Fold one finished round into the lifetime totals. */
export function applyRound(stats: QuizStats, round: { answered: number; correct: number }): QuizStats {
  return {
    rounds: stats.rounds + 1,
    answered: stats.answered + round.answered,
    correct: stats.correct + round.correct,
    best: Math.max(stats.best, round.correct),
  }
}

/** A kind line for a finished round. Never scolds. */
export function scoreMessage(correct: number, total: number): string {
  if (total === 0) return 'No questions this time.'
  const share = correct / total
  if (share === 1) return 'A perfect round. You know your breeds.'
  if (share >= 0.8) return 'Sharp eyes. Nearly all of them.'
  if (share >= 0.5) return 'A solid round. The ones you missed are below.'
  if (share > 0) return 'Look-alikes are hard. Peek at the ones you missed and go again.'
  return 'Tough set. Every breed you miss is one you will spot next time.'
}

export type QuizMode = { kind: 'any' } | { kind: 'common' } | { kind: 'group'; groupId: string } | { kind: 'met' }

export interface QuizQuestion {
  /** The breed in the photo. */
  breedId: string
  /** Breed ids to choose from, in display order. */
  options: string[]
  correctIndex: number
}

export const ROUND_SIZE = 10
export const CHOICES = 4

/** How a question is answered: pick from four names, or (the hardest round) search for the breed's name with no hints. */
export type QuizFormat = 'choices' | 'search'

/** How many answers a question offers in each format. The search round offers none: just the right breed, never shown. */
export const choicesFor = (format: QuizFormat): number => (format === 'search' ? 1 : CHOICES)
/** "Breeds you've met" needs at least this many quizzable breeds met, so a round has real variety. */
export const MIN_MET_TO_QUIZ = 4

/** Breeds the quiz can show a photo of. */
export function quizPool(breeds: Breed[], paths: Record<string, string>): Breed[] {
  return breeds.filter((b) => paths[b.id])
}

/** The breeds a round in this mode may ask about. */
export function poolForMode(pool: Breed[], mode: QuizMode, metBreedIds: ReadonlySet<string>): Breed[] {
  if (mode.kind === 'group') return pool.filter((b) => b.groupId === mode.groupId)
  if (mode.kind === 'met') return pool.filter((b) => metBreedIds.has(b.id))
  if (mode.kind === 'common') return pool.filter((b) => b.rarity === 'common')
  return pool
}

/** The name without a trailing "(Toy)"-style note, as a space-padded key. */
const nameKey = (b: Breed) => ` ${norm(b.name.replace(/\([^)]*\)/g, ''))} `

/**
 * Two breeds a player could fairly confuse by name alone: "Poodle" and "Poodle (Toy)", "Bulldog" and
 * "French Bulldog", "Cocker Spaniel" and "American Cocker Spaniel". Never offered together, so there is always one right answer.
 */
export function confusable(a: Breed, b: Breed): boolean {
  const ka = nameKey(a)
  const kb = nameKey(b)
  return ka.includes(kb) || kb.includes(ka)
}

/** A small seeded random number generator (mulberry32), so rounds can be reproduced in tests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A breed with fewer Dog CEO photos than this shows the same few pictures again and again, so it is asked about less often. */
export const FEW_PHOTOS = 3
/** How likely such a breed is to be picked for a question, compared with a breed that has plenty of photos (1). */
export const FEW_PHOTOS_WEIGHT = 0.25

export function photoWeight(photos: number | undefined): number {
  return photos !== undefined && photos < FEW_PHOTOS ? FEW_PHOTOS_WEIGHT : 1
}

/** Picks `k` distinct items at random, each more likely the larger its weight (Efraimidis-Spirakis). */
function weightedSample<T>(items: readonly T[], weight: (item: T) => number, k: number, rng: () => number): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(rng(), 1 / Math.max(weight(item), 1e-9)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.item)
}

export interface RoundOptions {
  /** Every breed the quiz has photos for. Wrong answers are drawn from here. */
  pool: Breed[]
  mode: QuizMode
  metBreedIds?: ReadonlySet<string>
  /** Photos Dog CEO has per breed id. Breeds with very few are asked about less often (never excluded). */
  photoCounts?: Record<string, number>
  rng?: () => number
  size?: number
  choices?: number
}

/**
 * Picks the questions for one round. Each question is a different breed. Wrong answers prefer the same category
 * (the look-alikes), then anything else (except in the easy common-breeds mode, which mixes categories), and are never confusable with the right answer or with each other.
 * A small pool gives a shorter round; fewer than two possible answers gives no question.
 * Breeds with only a couple of photos can still be asked about, just less often than the rest. (Only the photo's
 * breed is affected: any breed may still appear as a wrong answer, since that shows only a name.)
 */
export function buildRound({ pool, mode, metBreedIds = new Set(), photoCounts, rng = Math.random, size = ROUND_SIZE, choices = CHOICES }: RoundOptions): QuizQuestion[] {
  const targets = weightedSample(poolForMode(pool, mode, metBreedIds), (b) => photoWeight(photoCounts?.[b.id]), size, rng)
  const questions: QuizQuestion[] = []
  for (const target of targets) {
    if (choices <= 1) {
      // The "no choices" round: the player has to name the breed themselves, so there is nothing to pick wrong answers for.
      questions.push({ breedId: target.id, options: [target.id], correctIndex: 0 })
      continue
    }
    const others = pool.filter((b) => b.id !== target.id && !confusable(b, target))
    // Look-alikes from the same category make a question harder, so the easy mode (common breeds) mixes categories freely.
    const ordered =
      mode.kind === 'common'
        ? shuffled(others, rng)
        : [...shuffled(others.filter((b) => b.groupId === target.groupId), rng), ...shuffled(others.filter((b) => b.groupId !== target.groupId), rng)]
    const picked: Breed[] = []
    for (const candidate of ordered) {
      if (picked.length === choices - 1) break
      if (picked.some((p) => confusable(p, candidate))) continue
      picked.push(candidate)
    }
    if (picked.length === 0) continue
    const options = shuffled([target, ...picked], rng).map((b) => b.id)
    questions.push({ breedId: target.id, options, correctIndex: options.indexOf(target.id) })
  }
  return questions
}
