import { data } from '../data'
import type { BadgeDef } from '../data'
import { computeStats, evaluateBadges, newlyEarned } from '../domain/badges/engine'
import type { Repository } from './repo'

/** Re-evaluates every badge rule against current records, persists new awards once, and returns them. */
export async function awardNewBadges(repo: Repository): Promise<BadgeDef[]> {
  const snapshot = await repo.getSnapshot()
  const stats = computeStats(snapshot, data.breeds, (await repo.getSettings()).quizStats)
  const fresh = newlyEarned(evaluateBadges(data.badges, stats), new Set(snapshot.awards.map((a) => a.badgeId)))
  if (fresh.length) await repo.awardBadges(fresh.map((b) => b.id))
  return fresh
}
