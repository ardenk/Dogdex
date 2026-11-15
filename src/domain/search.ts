import type { Breed } from '../data/schema'

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Score how well a breed matches a query; 0 means no match.
 * Prefers exact > prefix > word-prefix > substring, on the name first and aliases second.
 */
function score(breed: Breed, q: string): number {
  const candidates: [string, number][] = [[breed.name, 1], ...breed.aliases.map((a): [string, number] => [a, 0.9])]
  let best = 0
  for (const [raw, weight] of candidates) {
    const text = norm(raw)
    let s = 0
    if (text === q) s = 100
    else if (text.startsWith(q)) s = 80
    else if (text.split(' ').some((w) => w.startsWith(q))) s = 60
    else if (q.split(' ').every((part) => text.split(' ').some((w) => w.startsWith(part)))) s = 50
    else if (text.includes(q)) s = 30
    best = Math.max(best, s * weight)
  }
  return best
}

export function searchBreeds(breeds: Breed[], query: string, limit = 12): Breed[] {
  const q = norm(query)
  if (!q) return []
  return breeds
    .map((b) => ({ b, s: score(b, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.b.name.localeCompare(b.b.name))
    .slice(0, limit)
    .map((x) => x.b)
}
