// Run with: npm run validate:data
import { readFileSync } from 'node:fs'
import { parseData } from '../src/data/schema.ts'

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'))

try {
  const d = parseData({
    groups: read('groups.json'),
    rarities: read('rarity.json'),
    breeds: read('breeds.json'),
    badges: read('badges.json'),
    quizImages: read('quizImages.json'),
  })
  console.log(
    `OK: ${d.breeds.length} breeds, ${d.groups.length} groups, ${d.rarities.length} rarity tiers, ${d.badges.length} badges, ${d.quizImages.length} quizzable breeds`,
  )
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
