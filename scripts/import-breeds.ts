// Run with: npm run import:breeds          (writes src/data/breeds.json)
//           npm run import:breeds -- --dry  (prints the report, changes nothing)
//
// Pulls the full breed list from The Dog API (https://thedogapi.com) and appends the breeds Dogdex does not have yet.
// Needs DOG_API_KEY in .env. The key is only used here, on your computer, and never ships in the app.
// The Dog API's free plan is meant for learning and hobby projects: read its terms before publishing widely.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseData } from '../src/data/schema.ts'
import type { Breed } from '../src/data/schema.ts'
import { buildBreeds, serializeBreeds } from './lib/importBreeds.ts'
import type { ApiBreed } from './lib/importBreeds.ts'

const dry = process.argv.includes('--dry')
const key = process.env.DOG_API_KEY
if (!key) {
  console.error('DOG_API_KEY is not set. Put DOG_API_KEY=... in .env and run: npm run import:breeds')
  process.exit(1)
}

const here = (p: string) => new URL(p, import.meta.url)
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'))

async function fetchAll(): Promise<ApiBreed[]> {
  const all: ApiBreed[] = []
  const limit = 500
  // The API numbers pages from 0 and answers with a pagination-count header (the total).
  for (let page = 0; page < 20; page++) {
    const res = await fetch(`https://api.thedogapi.com/v1/breeds?limit=${limit}&page=${page}`, { headers: { 'x-api-key': key as string } })
    if (!res.ok) throw new Error(`The Dog API answered ${res.status} for page ${page}`)
    const rows = (await res.json()) as ApiBreed[]
    all.push(...rows)
    const total = Number(res.headers.get('pagination-count') ?? NaN)
    if (rows.length < limit || (Number.isFinite(total) && all.length >= total)) break
  }
  return all
}

const groups = readJson(here('../src/data/groups.json')) as { id: string; name: string; order: number }[]
const sortedGroups = [...groups].sort((a, b) => a.order - b.order)
const existing = readJson(here('../src/data/breeds.json')) as Breed[]
const rarityOverrides = readJson(here('./data/rarity-overrides.json')) as Record<string, string>

const api = await fetchAll()
console.log(`Fetched ${api.length} breeds from The Dog API.`)

const { breeds, added, report } = buildBreeds({
  api,
  existing,
  groupOrder: sortedGroups.map((g) => g.id),
  groupNames: Object.fromEntries(groups.map((g) => [g.id, g.name])),
  rarityOverrides,
  // Our hand-written names that differ from the API's. Add to this if a curated breed shows up under "kept as they are".
  nameOverrides: {},
  // The API files these under "Foundation Stock Service" (a registry, not a group); they are hunting dogs.
  groupOverrides: { 'Mountain Cur': 'hound', 'Treeing Feist': 'hound', 'Mountain Feist': 'hound' },
})

const perGroup = new Map<string, number>()
for (const b of breeds) perGroup.set(b.groupId, (perGroup.get(b.groupId) ?? 0) + 1)
console.log(`\nResult: ${breeds.length} breeds (${added.length} new).`)
console.log([...perGroup].map(([g, n]) => `${g} ${n}`).join(', '))
console.log(`\nMatched to breeds you already had: ${report.matched.length}`)
for (const [id, name] of report.matched) console.log(`  ${id} <- ${name}`)
console.log(`\nHand-written breeds with no API match (kept as they are): ${report.unmatchedExisting.join(', ') || 'none'}`)
console.log(`\nFiled under a nearby group (the API's group is not an AKC group): ${report.odd.length}`)
for (const o of report.odd) console.log(`  ${o.name}: ${o.from} -> ${o.to} (rarity: rare unless overridden)`)
if (report.renamedIds.length) console.log(`\nIds changed to stay unique:\n  ${report.renamedIds.join('\n  ')}`)
if (report.droppedAliases.length) console.log(`\nAliases dropped because two breeds claimed them: ${report.droppedAliases.length}\n  ${report.droppedAliases.slice(0, 40).join('\n  ')}`)
if (report.unusedOverrides.length) console.log(`\nrarity-overrides.json names that matched no new breed (fine if the breed was already in your list): ${report.unusedOverrides.join(', ')}`)
if (report.skipped.length) console.log(`\nSkipped: ${report.skipped.join(', ')}`)

// Check the result the same way the app does before writing anything.
parseData({
  groups,
  rarities: readJson(here('../src/data/rarity.json')),
  breeds,
  badges: readJson(here('../src/data/badges.json')),
})

if (dry) {
  console.log('\nDry run: breeds.json was not changed.')
} else {
  writeFileSync(here('../src/data/breeds.json'), serializeBreeds(breeds))
  console.log('\nWrote src/data/breeds.json. Review it with git diff, then run npm run check.')
}
