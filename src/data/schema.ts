import { z } from 'zod'

/**
 * Zod schemas for the editable data files in this folder.
 * Types used across the app are inferred from these, so the files and the code can't drift apart.
 */

export const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int(),
  blurb: z.string(),
})

export const raritySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** A symbol shown next to the label so rarity never relies on color alone. */
  glyph: z.string().min(1),
  order: z.number().int(),
  /** none = silent, toast = small message, full = celebration overlay */
  celebration: z.enum(['none', 'toast', 'full']),
  message: z.string(),
})

export const breedSchema = z.object({
  id: z.string().min(1),
  /**
   * The breed's permanent "No. 001" Dogdex number. Fixed once assigned so adding breeds never renumbers
   * the ones you already collected. A breed without one gets the next free number (see data/index.ts).
   */
  entry: z.number().int().positive().optional(),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  groupId: z.string().min(1),
  origin: z.string(),
  rarity: z.string().min(1),
  temperament: z.array(z.string()),
  summary: z.string().min(1),
  traits: z.array(z.string()),
  tags: z.array(z.string()),
})

export const badgeRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('total_dogs'), gte: z.number().int().positive() }),
  z.object({ type: z.literal('tag_count'), tag: z.string().min(1), gte: z.number().int().positive() }),
  z.object({ type: z.literal('group_complete'), excludeGroups: z.array(z.string()).default([]) }),
  z.object({ type: z.literal('rarity_count'), rarity: z.string().min(1), gte: z.number().int().positive() }),
  z.object({ type: z.literal('guess_correct_count'), gte: z.number().int().positive() }),
])

export const badgeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  glyph: z.string().min(1),
  rule: badgeRuleSchema,
})

export type Group = z.infer<typeof groupSchema>
export type RarityTier = z.infer<typeof raritySchema>
export type Breed = z.infer<typeof breedSchema>
export type BadgeRule = z.infer<typeof badgeRuleSchema>
export type BadgeDef = z.infer<typeof badgeSchema>

export interface DogdexData {
  groups: Group[]
  rarities: RarityTier[]
  breeds: Breed[]
  badges: BadgeDef[]
}

/** Validates the raw JSON and checks cross-references (e.g. a breed's group exists). Throws with a readable message. */
export function parseData(raw: {
  groups: unknown
  rarities: unknown
  breeds: unknown
  badges: unknown
}): DogdexData {
  const groups = z.array(groupSchema).parse(raw.groups)
  const rarities = z.array(raritySchema).parse(raw.rarities)
  const breeds = z.array(breedSchema).parse(raw.breeds)
  const badges = z.array(badgeSchema).parse(raw.badges)

  const errors: string[] = []
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`Duplicate ${label} id: "${id}"`)
      seen.add(id)
    }
  }
  unique('group', groups.map((g) => g.id))
  unique('rarity', rarities.map((r) => r.id))
  unique('breed', breeds.map((b) => b.id))
  const entries = new Map<number, string>()
  for (const b of breeds) {
    if (b.entry === undefined) continue
    const other = entries.get(b.entry)
    if (other) errors.push(`Breeds "${other}" and "${b.id}" share entry number ${b.entry}`)
    entries.set(b.entry, b.id)
  }
  unique('badge', badges.map((b) => b.id))

  const groupIds = new Set(groups.map((g) => g.id))
  const rarityIds = new Set(rarities.map((r) => r.id))
  for (const b of breeds) {
    if (!groupIds.has(b.groupId)) errors.push(`Breed "${b.id}" has unknown group "${b.groupId}"`)
    if (!rarityIds.has(b.rarity)) errors.push(`Breed "${b.id}" has unknown rarity "${b.rarity}"`)
  }
  for (const badge of badges) {
    const r = badge.rule
    if (r.type === 'rarity_count' && !rarityIds.has(r.rarity))
      errors.push(`Badge "${badge.id}" references unknown rarity "${r.rarity}"`)
    if (r.type === 'group_complete')
      for (const g of r.excludeGroups)
        if (!groupIds.has(g)) errors.push(`Badge "${badge.id}" excludes unknown group "${g}"`)
  }
  if (errors.length) throw new Error(`Invalid Dogdex data:\n - ${errors.join('\n - ')}`)

  return {
    groups: [...groups].sort((a, b) => a.order - b.order),
    rarities: [...rarities].sort((a, b) => a.order - b.order),
    breeds,
    badges,
  }
}
