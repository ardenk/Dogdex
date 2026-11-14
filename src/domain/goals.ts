import type { Encounter } from './types'

/** Start of the week (local time) containing `date`. Default week starts Monday. */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/** Encounters (new dogs and "met again") logged in the week containing `now`. */
export function countThisWeek(encounters: Encounter[], now: Date = new Date(), weekStartsOn: 0 | 1 = 1): number {
  const start = startOfWeek(now, weekStartsOn)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return encounters.filter((e) => e.metAt >= start.getTime() && e.metAt < end.getTime()).length
}

/** Gentle, never-guilt-tripping copy for goal progress. */
export function goalMessage(count: number, target: number): string {
  if (count >= target * 2) return 'Double your goal. What a week.'
  if (count >= target) return 'Goal reached. Everything else is a bonus.'
  if (count === 0) return 'A fresh week. Whenever you meet a dog.'
  const left = target - count
  return left === 1 ? 'One more dog to reach your goal.' : `${left} more to reach your goal.`
}
