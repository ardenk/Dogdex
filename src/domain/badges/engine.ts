import type { BadgeDef, Breed } from '../../data/schema'
import type { QuizStats, Snapshot } from '../types'

export interface Stats {
  totalDogs: number
  /** Distinct dogs per breed tag. */
  tagCounts: Record<string, number>
  /** Distinct dogs per rarity tier. */
  rarityCounts: Record<string, number>
  loggedBreedIds: Set<string>
  /** Group ids where every breed in the dataset has been logged. */
  completedGroupIds: string[]
  guessesCorrect: number
  /** Right answers across every breed quiz round. */
  quizCorrect: number
}

/** Pure: everything a badge rule might need, derived from the user's records and the breed dataset. */
export function computeStats(snapshot: Snapshot, breeds: Breed[], quiz?: QuizStats): Stats {
  const byId = new Map(breeds.map((b) => [b.id, b]))
  const tagCounts: Record<string, number> = {}
  const rarityCounts: Record<string, number> = {}
  const loggedBreedIds = new Set<string>()

  for (const dog of snapshot.dogs) {
    if (!dog.breedId) continue
    const breed = byId.get(dog.breedId)
    if (!breed) continue
    loggedBreedIds.add(breed.id)
    rarityCounts[breed.rarity] = (rarityCounts[breed.rarity] ?? 0) + 1
    for (const tag of new Set(breed.tags)) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
  }

  const groupBreeds = new Map<string, string[]>()
  for (const b of breeds) groupBreeds.set(b.groupId, [...(groupBreeds.get(b.groupId) ?? []), b.id])
  const completedGroupIds = [...groupBreeds.entries()]
    .filter(([, ids]) => ids.length > 0 && ids.every((id) => loggedBreedIds.has(id)))
    .map(([g]) => g)

  return {
    totalDogs: snapshot.dogs.length,
    tagCounts,
    rarityCounts,
    loggedBreedIds,
    completedGroupIds,
    guessesCorrect: snapshot.guesses.filter((g) => g.correct === true).length,
    quizCorrect: quiz?.correct ?? 0,
  }
}

export interface BadgeProgress {
  badge: BadgeDef
  current: number
  target: number
  earned: boolean
}

export function evaluateBadge(badge: BadgeDef, stats: Stats): BadgeProgress {
  const rule = badge.rule
  let current = 0
  let target = 1
  switch (rule.type) {
    case 'total_dogs':
      current = stats.totalDogs
      target = rule.gte
      break
    case 'tag_count':
      current = stats.tagCounts[rule.tag] ?? 0
      target = rule.gte
      break
    case 'group_complete':
      current = stats.completedGroupIds.filter((g) => !rule.excludeGroups.includes(g)).length
      target = 1
      break
    case 'rarity_count':
      current = stats.rarityCounts[rule.rarity] ?? 0
      target = rule.gte
      break
    case 'guess_correct_count':
      current = stats.guessesCorrect
      target = rule.gte
      break
    case 'quiz_correct_count':
      current = stats.quizCorrect
      target = rule.gte
      break
  }
  return { badge, current: Math.min(current, target), target, earned: current >= target }
}

export function evaluateBadges(badges: BadgeDef[], stats: Stats): BadgeProgress[] {
  return badges.map((b) => evaluateBadge(b, stats))
}

/** Badges that are earned now but not yet awarded. */
export function newlyEarned(progress: BadgeProgress[], alreadyAwarded: Set<string>): BadgeDef[] {
  return progress.filter((p) => p.earned && !alreadyAwarded.has(p.badge.id)).map((p) => p.badge)
}
