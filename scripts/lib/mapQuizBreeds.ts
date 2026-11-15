/**
 * Pure logic for `npm run map:quiz`: pairs Dog CEO's breeds (https://dog.ceo/dog-api/) with Dogdex breeds so the
 * quiz knows which photo set shows which breed. No network or file access here (tested in src/test/mapQuizBreeds.test.ts).
 *
 * Dog CEO names a breed "beagle" or a main breed plus a sub-breed ("hound" + "afghan" = Afghan Hound).
 */
import type { Breed } from '../../src/data/schema.ts'
import { norm } from './importBreeds.ts'

export interface CeoPair {
  main: string
  sub?: string
  /** The path used in Dog CEO URLs: "beagle" or "hound/afghan". */
  path: string
}

/** Flattens Dog CEO's `{ hound: ['afghan', ...], beagle: [] }` into one entry per photo set. */
export function listPairs(all: Record<string, string[]>): CeoPair[] {
  return Object.entries(all).flatMap(([main, subs]) =>
    subs.length === 0 ? [{ main, path: main }] : subs.map((sub) => ({ main, sub, path: `${main}/${sub}` })),
  )
}

export interface QuizMapping {
  /** One entry per Dogdex breed that has photos. Sorted by breed id so a re-run gives a clean diff. */
  mapped: { breedId: string; path: string }[]
  /** Dog CEO photo sets with no Dogdex breed (not an error: our list does not have every breed). */
  unmatched: CeoPair[]
  /** Matches made only on a sub-breed's own name ("kelpie"); worth a glance. */
  looseMatches: { path: string; breedId: string }[]
  /** Two photo sets that wanted the same Dogdex breed: the first wins, the rest are listed here. */
  duplicates: { path: string; breedId: string }[]
  /** Overrides that name a breed id or a Dog CEO path that does not exist. */
  badOverrides: string[]
}

export function mapQuizBreeds(pairs: CeoPair[], breeds: Breed[], overrides: Record<string, string>): QuizMapping {
  const byKey = new Map<string, Breed>()
  for (const b of breeds) for (const n of [b.name, b.id, ...b.aliases]) if (!byKey.has(norm(n))) byKey.set(norm(n), b)
  const byId = new Map(breeds.map((b) => [b.id, b]))
  const paths = new Set(pairs.map((p) => p.path))

  const out: QuizMapping = { mapped: [], unmatched: [], looseMatches: [], duplicates: [], badOverrides: [] }
  for (const [path, id] of Object.entries(overrides)) {
    if (!paths.has(path)) out.badOverrides.push(`${path}: Dog CEO has no such photo set`)
    if (!byId.has(id)) out.badOverrides.push(`${path} -> ${id}: no such breed id`)
  }

  const taken = new Map<string, string>()
  for (const p of pairs) {
    const forced = overrides[p.path]
    let breed = forced ? byId.get(forced) : undefined
    let loose = false
    if (!breed) {
      const names = p.sub ? [`${p.sub} ${p.main}`, `${p.main} ${p.sub}`] : [p.main]
      breed = names.map((n) => byKey.get(norm(n))).find(Boolean)
      if (!breed && p.sub) {
        breed = byKey.get(norm(p.sub))
        loose = !!breed
      }
    }
    if (!breed) {
      out.unmatched.push(p)
      continue
    }
    if (taken.has(breed.id)) {
      out.duplicates.push({ path: p.path, breedId: breed.id })
      continue
    }
    taken.set(breed.id, p.path)
    if (loose) out.looseMatches.push({ path: p.path, breedId: breed.id })
    out.mapped.push({ breedId: breed.id, path: p.path })
  }
  out.mapped.sort((a, b) => a.breedId.localeCompare(b.breedId))
  return out
}

/** quizImages.json text: one breed per line. */
export function serializeQuizImages(mapped: { breedId: string; path: string; photos?: number }[]): string {
  const row = (m: { breedId: string; path: string; photos?: number }) =>
    `  { "breedId": ${JSON.stringify(m.breedId)}, "path": ${JSON.stringify(m.path)}${m.photos === undefined ? '' : `, "photos": ${m.photos}`} }`
  return `[\n${mapped.map(row).join(',\n')}\n]\n`
}
