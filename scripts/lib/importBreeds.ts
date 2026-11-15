/**
 * Pure logic for `npm run import:breeds`: turns The Dog API's breed list into entries for src/data/breeds.json.
 * No network or file access here, so it can be unit-tested (src/test/importBreeds.test.ts).
 *
 * Rules:
 *  - Breeds already in breeds.json are NEVER changed (your edits and the hand-written facts are safe), except that
 *    search aliases from the API are added to them. The import only appends breeds it has not seen before.
 *  - New breeds get the next free Dogdex number, so numbers you have already collected never move.
 *  - Anything it had to guess (an unusual API group, a renamed id) is reported, not hidden.
 */
import type { Breed } from '../../src/data/schema.ts'

export interface ApiBreed {
  id?: string | number
  name?: string | null
  alt_names?: string | null
  breed_group?: string | null
  origin?: string | null
  temperament?: string | null
  description?: string | null
}

/** The API's own group names that already are one of our groups. */
const STANDARD_GROUPS: Record<string, string> = {
  sporting: 'sporting',
  hound: 'hound',
  working: 'working',
  terrier: 'terrier',
  toy: 'toy',
  'non-sporting': 'non-sporting',
  herding: 'herding',
  mixed: 'mixed',
}

/** Groups the API uses that are not AKC groups, filed under the nearest one. Every use is listed in the import report. */
const ODD_GROUPS: Record<string, string> = {
  primitive: 'hound',
  'primitive/wild canid': 'hound',
  sighthound: 'hound',
  'scent hound': 'hound',
  scenthound: 'hound',
  'spitz and primitive types': 'non-sporting',
  spitz: 'non-sporting',
  'spitz-type': 'non-sporting',
  companion: 'non-sporting',
  utility: 'non-sporting',
  guardian: 'working',
  northern: 'working',
  landrace: 'working',
  'pastoral/herding': 'herding',
  'mixed breed': 'mixed',
  'sighthound & pariah': 'hound',
  pariah: 'hound',
  'foundation stock service': 'non-sporting',
  unknown: 'non-sporting',
}
const FALLBACK_GROUP = 'non-sporting'

/** Folds accents away: "Lài" -> "Lai". */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** A comparison key: lowercase letters and digits only. */
export const norm = (s: string): string => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, '')
export const slug = (s: string): string =>
  fold(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export function classifyGroup(raw: string | null | undefined): { groupId: string; odd: boolean } {
  const key = (raw ?? '').trim().toLowerCase()
  if (STANDARD_GROUPS[key]) return { groupId: STANDARD_GROUPS[key], odd: false }
  return { groupId: ODD_GROUPS[key] ?? FALLBACK_GROUP, odd: true }
}

const splitList = (s: string | null | undefined, sep: RegExp): string[] =>
  (s ?? '')
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean)

/** Words that earn a tag (the same tags the hand-written breeds use, for badge rules and grouping). */
function tagsFor(name: string, groupId: string): string[] {
  const n = name.toLowerCase()
  const tags: string[] = []
  if (groupId === 'mixed' && /doodle$/.test(n)) tags.push('doodle', 'poodle-mix')
  else if (groupId === 'mixed' && /poo$/.test(n)) tags.push('poodle-mix')
  for (const word of ['retriever', 'spaniel', 'bulldog', 'shepherd', 'collie', 'corgi', 'spitz']) if (n.includes(word)) tags.push(word)
  return tags
}

export interface ImportInput {
  api: ApiBreed[]
  /** What breeds.json holds now. */
  existing: Breed[]
  groupOrder: string[]
  groupNames: Record<string, string>
  /** Breed name or id -> rarity id, for new breeds. */
  rarityOverrides: Record<string, string>
  /** Breed name -> group id, for breeds whose API group is wrong or unusual. Beats the API's group. */
  groupOverrides?: Record<string, string>
  /** Breed ids in `existing` mapped to the API breed name they correspond to, when the names differ. */
  nameOverrides?: Record<string, string>
}

export interface ImportReport {
  /** existing breed id <- API name it was matched to */
  matched: [string, string][]
  /** Existing breeds with no API counterpart (kept as they are). */
  unmatchedExisting: string[]
  /** New breeds filed under a group the API does not use as an AKC group. */
  odd: { name: string; from: string; to: string }[]
  /** Ids that had to be changed to stay unique. */
  renamedIds: string[]
  /** Aliases dropped because they would point at two different breeds. */
  droppedAliases: string[]
  /** Rarity override names that matched no breed. */
  unusedOverrides: string[]
  skipped: string[]
}

export interface ImportResult {
  breeds: Breed[]
  added: Breed[]
  report: ImportReport
}

export function buildBreeds(input: ImportInput): ImportResult {
  const { api, existing, groupOrder, groupNames, rarityOverrides } = input
  const groupOverrides = new Map(Object.entries(input.groupOverrides ?? {}).map(([k, v]) => [norm(k), v]))
  const report: ImportReport = { matched: [], unmatchedExisting: [], odd: [], renamedIds: [], droppedAliases: [], unusedOverrides: [], skipped: [] }

  // 1. Pair API breeds with breeds we already have, by name or by one of our aliases. Alt names are not used for matching
  //    (they are too loose: "Beagle-Harrier" lists "Beagle").
  const keyToExisting = new Map<string, Breed>()
  for (const b of existing) {
    keyToExisting.set(norm(b.name), b)
    keyToExisting.set(norm(b.id), b)
  }
  for (const b of existing) for (const a of b.aliases) if (!keyToExisting.has(norm(a))) keyToExisting.set(norm(a), b)
  const wantedName = new Map(Object.entries(input.nameOverrides ?? {}).map(([id, name]) => [norm(name), id]))
  const byId = new Map(existing.map((b) => [b.id, b]))

  const matchedApi = new Map<Breed, ApiBreed>()
  const fresh: ApiBreed[] = []
  for (const a of api) {
    const name = a.name?.trim()
    if (!name) {
      report.skipped.push(String(a.id ?? '?'))
      continue
    }
    const forced = wantedName.get(norm(name))
    const hit = (forced ? byId.get(forced) : undefined) ?? keyToExisting.get(norm(name))
    if (hit && !matchedApi.has(hit)) matchedApi.set(hit, a)
    else if (!hit) fresh.push(a)
    else report.skipped.push(`${name} (duplicate of ${hit.name})`)
  }
  for (const [b, a] of matchedApi) report.matched.push([b.id, a.name ?? ''])
  report.unmatchedExisting = existing.filter((b) => !matchedApi.has(b)).map((b) => b.id)

  // 2. Existing breeds keep every field; they only gain aliases.
  const updatedExisting = existing.map((b) => {
    const a = matchedApi.get(b)
    if (!a) return b
    const extra = splitList(a.alt_names, /[,;]/).filter((x) => norm(x) !== norm(b.name))
    return { ...b, aliases: dedupe([...b.aliases, ...extra]) }
  })

  // 3. New breeds, in a stable order so a re-run produces the same file.
  const rank = (g: string) => (groupOrder.indexOf(g) === -1 ? 99 : groupOrder.indexOf(g))
  const classified = fresh
    .map((a) => {
      const name = (a.name as string).trim()
      const forced = groupOverrides.get(norm(name))
      return { a, name, ...(forced ? { groupId: forced, odd: false } : classifyGroup(a.breed_group)) }
    })
    .sort((x, y) => rank(x.groupId) - rank(y.groupId) || x.name.localeCompare(y.name))

  const usedIds = new Set(updatedExisting.map((b) => b.id))
  const overrideKeys = new Map(Object.entries(rarityOverrides).map(([k, v]) => [norm(k), v]))
  const usedOverrides = new Set<string>()
  let nextEntry = Math.max(0, ...existing.map((b) => b.entry ?? 0)) + 1
  const added: Breed[] = []

  for (const { a, name, groupId, odd } of classified) {
    let id = slug(name)
    if (usedIds.has(id)) {
      const wanted = id
      id = `${id}-${groupId}`
      for (let n = 2; usedIds.has(id); n++) id = `${slug(name)}-${groupId}-${n}`
      report.renamedIds.push(`${name}: ${wanted} -> ${id}`)
    }
    usedIds.add(id)

    if (odd) report.odd.push({ name, from: a.breed_group?.trim() || '(none)', to: groupId })

    const overridden = overrideKeys.get(norm(name)) ?? overrideKeys.get(norm(id))
    if (overridden) usedOverrides.add(norm(overrideKeys.has(norm(name)) ? name : id))
    const rarity = overridden ?? (odd ? 'rare' : 'uncommon')

    const swapped = name.match(/^(.*?)\s*\((.*)\)$/)
    const aliases = dedupe([
      ...splitList(a.alt_names, /[,;]/),
      ...(swapped ? [`${swapped[2]} ${swapped[1]}`] : []),
      ...(fold(name) !== name ? [fold(name)] : []),
    ]).filter((x) => norm(x) !== norm(name))

    const origin = a.origin?.trim() ?? ''
    const group = groupNames[groupId] ?? groupId
    const summary = a.description?.trim() || `A ${group.toLowerCase()} breed${origin ? ` from ${origin}` : ''}.`

    added.push({
      id,
      entry: nextEntry++,
      name,
      aliases,
      groupId,
      origin,
      rarity,
      temperament: splitList(a.temperament, /[,;]/).map(capitalize),
      summary,
      traits: [],
      tags: tagsFor(name, groupId),
    })
  }
  report.unusedOverrides = [...overrideKeys.keys()].filter((k) => !usedOverrides.has(k))

  // 4. An alias must point at one breed only, because the identifier maps a label to the first breed that claims it.
  const breeds = [...updatedExisting, ...added]
  const owner = new Map<string, string>()
  for (const b of breeds) owner.set(norm(b.name), b.id)
  for (const b of breeds) {
    b.aliases = b.aliases.filter((al) => {
      const k = norm(al)
      const taken = owner.get(k)
      if (taken && taken !== b.id) {
        report.droppedAliases.push(`${b.name}: "${al}" (also ${taken})`)
        return false
      }
      owner.set(k, b.id)
      return true
    })
  }

  // 5. Dogdex order: group order, then entry number.
  breeds.sort((x, y) => rank(x.groupId) - rank(y.groupId) || (x.entry ?? 0) - (y.entry ?? 0))
  return { breeds, added, report }
}

/** "eager to please" -> "Eager to please", so the list reads the same as the hand-written breeds. */
export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  return list.filter((s) => {
    const k = norm(s)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** breeds.json text: one field per line, short lists on one line, so the file diffs and reads like the hand-written one. */
export function serializeBreeds(breeds: Breed[]): string {
  const list = (a: string[]) => `[${a.map((s) => JSON.stringify(s)).join(', ')}]`
  const rows = breeds.map((b) =>
    [
      '  {',
      `    "id": ${JSON.stringify(b.id)},`,
      `    "entry": ${b.entry},`,
      `    "name": ${JSON.stringify(b.name)},`,
      `    "aliases": ${list(b.aliases)},`,
      `    "groupId": ${JSON.stringify(b.groupId)},`,
      `    "origin": ${JSON.stringify(b.origin)},`,
      `    "rarity": ${JSON.stringify(b.rarity)},`,
      `    "temperament": ${list(b.temperament)},`,
      `    "summary": ${JSON.stringify(b.summary)},`,
      `    "traits": ${list(b.traits)},`,
      `    "tags": ${list(b.tags)}`,
      '  }',
    ].join('\n'),
  )
  return `[\n${rows.join(',\n')}\n]\n`
}
