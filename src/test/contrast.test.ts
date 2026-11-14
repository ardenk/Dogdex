import { describe, expect, it } from 'vitest'

// Keep these in sync with src/styles/tokens.css
const t = { paper: '#f3ede0', sunk: '#e8e0cd', card: '#fbf8f1', ink: '#1b1a17', soft: '#4a463e', accent: '#c2361b', onAccent: '#ffffff', wash: '#f6d9d0' }

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('WCAG AA contrast (4.5:1 for text)', () => {
  const pairs: [string, string, string][] = [
    ['ink on paper', t.ink, t.paper],
    ['ink on card', t.ink, t.card],
    ['soft ink on paper', t.soft, t.paper],
    ['soft ink on sunk paper', t.soft, t.sunk],
    ['paper on ink', t.paper, t.ink],
    ['white on accent', t.onAccent, t.accent],
    ['accent on paper', t.accent, t.paper],
    ['accent on card', t.accent, t.card],
    ['ink on accent wash', t.ink, t.wash],
  ]
  it.each(pairs)('%s', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
