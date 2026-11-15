/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom does no layout, so a photo that is not sized to its box cannot be caught by rendering. This reads the stylesheet instead.
const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.>[\]()]/g, '\\$&')
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`No CSS rule for ${selector}`)
  return m[1]
}

describe('photos are sized to their box, so cropping and the dog’s framing actually apply', () => {
  it('the dog page and breed page photo fills the box as an absolutely positioned cover image', () => {
    // Regression: as a grid item with "height: 100%" it kept its own tall shape, was clipped from the top, and ignored the framing.
    const hero = rule('.hero > img')
    expect(hero).toMatch(/position:\s*absolute/)
    expect(hero).toMatch(/inset:\s*0/)
    expect(hero).toMatch(/width:\s*100%/)
    expect(hero).toMatch(/height:\s*100%/)
    expect(hero).toMatch(/object-fit:\s*cover/)
    expect(rule('.hero')).toMatch(/position:\s*relative/) // the anchor for the absolute photo
    expect(rule('.hero')).toMatch(/aspect-ratio:\s*4\s*\/\s*3/)
  })

  it('every other cropped photo is a cover image in a box of a fixed size', () => {
    for (const selector of ['.thumb > img', '.photo-strip__item img']) expect(rule(selector), selector).toMatch(/object-fit:\s*cover/)
    expect(rule('.thumb')).toMatch(/height:\s*54px/)
    expect(rule('.photo-strip__item')).toMatch(/height:\s*51px/)
    expect(rule('.photo-stack__item')).toMatch(/position:\s*absolute/)
    expect(rule('.photo-stack__item')).toMatch(/object-fit:\s*cover/)
  })

  it('the framing preview is a 4:3 box with a cover image, like the real thing', () => {
    expect(rule('.framing-preview')).toMatch(/aspect-ratio:\s*4\s*\/\s*3/)
    expect(rule('.framing-preview img')).toMatch(/object-fit:\s*cover/)
  })
})
