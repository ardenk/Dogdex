import { raritiesById } from '../data'

/** Rarity is always a glyph plus a word, never color alone. */
export function RarityMark({ rarity }: { rarity: string }) {
  const tier = raritiesById[rarity]
  if (!tier) return null
  return (
    <span className={`rarity rarity--${tier.id}`}>
      <span aria-hidden="true">{tier.glyph}</span>
      {tier.label}
    </span>
  )
}
