// Run with: npm run map:quiz          (writes src/data/quizImages.json)
//           npm run map:quiz -- --dry  (prints the report, changes nothing)
//
// Pairs Dog CEO's photo sets (https://dog.ceo/dog-api/, no key needed) with Dogdex breeds for the breed quiz.
// Name matches are automatic; the ones that need a human are in scripts/data/quiz-name-overrides.json.
// Each mapped photo set is checked to have photos, and its photo count is saved so the quiz can ask less about thin sets.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseData } from '../src/data/schema.ts'
import type { Breed } from '../src/data/schema.ts'
import { listPairs, mapQuizBreeds, serializeQuizImages } from './lib/mapQuizBreeds.ts'

const dry = process.argv.includes('--dry')
const here = (p: string) => new URL(p, import.meta.url)
const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'))

const res = await fetch('https://dog.ceo/api/breeds/list/all')
if (!res.ok) throw new Error(`Dog CEO answered ${res.status}`)
const all = ((await res.json()) as { message: Record<string, string[]> }).message
const pairs = listPairs(all)
console.log(`Dog CEO lists ${Object.keys(all).length} breeds / ${pairs.length} photo sets.`)

const breeds = readJson(here('../src/data/breeds.json')) as Breed[]
const overrides = readJson(here('./data/quiz-name-overrides.json')) as Record<string, string>
const result = mapQuizBreeds(pairs, breeds, overrides)

// Count each set's photos. A set with none (or that errors) is left out, so every mapped breed really has photos.
const working: { breedId: string; path: string; photos: number }[] = []
const broken: string[] = []
for (const m of result.mapped) {
  try {
    const r = await fetch(`https://dog.ceo/api/breed/${m.path}/images`)
    const body = (await r.json()) as { status?: string; message?: string[] }
    const urls = Array.isArray(body.message) ? body.message.filter((u) => u.startsWith('https://images.dog.ceo/')) : []
    if (r.ok && body.status === 'success' && urls.length > 0) working.push({ ...m, photos: urls.length })
    else broken.push(m.path)
  } catch {
    broken.push(m.path)
  }
}
const few = working.filter((w) => w.photos < 3)

console.log(`\nMapped ${working.length} Dogdex breeds to photos.`)
if (few.length) console.log(`Breeds with fewer than 3 photos (the quiz asks about these less often): ${few.map((f) => `${f.breedId} (${f.photos})`).join(', ')}`)
if (broken.length) console.log(`Photo sets that did not return an image (left out): ${broken.join(', ')}`)
if (result.leftOut.length) console.log(`\nLeft out on purpose: ${result.leftOut.join(', ')}`)
if (result.badOverrides.length) console.log(`\nProblems in quiz-name-overrides.json:\n  ${result.badOverrides.join('\n  ')}`)
if (result.looseMatches.length) console.log(`\nMatched on the sub-breed name alone (worth a look):\n  ${result.looseMatches.map((l) => `${l.path} -> ${l.breedId}`).join('\n  ')}`)
if (result.duplicates.length) console.log(`\nSecond photo set for a breed already mapped (skipped):\n  ${result.duplicates.map((d) => `${d.path} -> ${d.breedId}`).join('\n  ')}`)
console.log(`\nDog CEO photo sets with no Dogdex breed: ${result.unmatched.length}\n  ${result.unmatched.map((u) => u.path).join(', ')}`)

if (result.badOverrides.length) {
  console.error('\nFix the problems above first; nothing was written.')
  process.exit(1)
}

// The same check the app runs at startup.
parseData({
  groups: readJson(here('../src/data/groups.json')),
  rarities: readJson(here('../src/data/rarity.json')),
  breeds,
  badges: readJson(here('../src/data/badges.json')),
  quizImages: working,
})

if (dry) {
  console.log('\nDry run: quizImages.json was not changed.')
} else {
  writeFileSync(here('../src/data/quizImages.json'), serializeQuizImages(working))
  console.log('\nWrote src/data/quizImages.json. Review it with git diff, then run npm run check.')
}
