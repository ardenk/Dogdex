import { describe, expect, it } from 'vitest'
import { BOX_ASPECT, CENTER, clampFocus, coverPosition, focusOf, isCentered, objectPosition } from '../domain/photoFocus'
import { seededRng } from '../domain/quiz'

describe('focusOf', () => {
  it('is the center when nothing was chosen, and reads a saved point', () => {
    expect(focusOf(undefined)).toEqual(CENTER)
    expect(focusOf({})).toEqual(CENTER)
    expect(focusOf({ focusX: null, focusY: null })).toEqual(CENTER)
    expect(focusOf({ focusX: 0.2, focusY: 0.7 })).toEqual({ x: 0.2, y: 0.7 })
  })

  it('keeps a point inside the photo, and never produces NaN', () => {
    expect(clampFocus({ x: -3, y: 9 })).toEqual({ x: 0, y: 1 })
    expect(clampFocus({ x: Number.NaN, y: Infinity })).toEqual({ x: 0.5, y: 0.5 })
    expect(focusOf({ focusX: 7, focusY: -1 })).toEqual({ x: 1, y: 0 })
  })

  it('knows when a point is the center', () => {
    expect(isCentered(CENTER)).toBe(true)
    expect(isCentered({ x: 0.5, y: 0.52 })).toBe(false)
  })
})

describe('coverPosition: where the crop window sits', () => {
  it('does nothing for a photo already in the box’s shape', () => {
    expect(coverPosition({ x: 0.1, y: 0.9 }, BOX_ASPECT)).toEqual(CENTER)
  })

  it('crops a tall photo from the top and bottom only, centered on the point where it can be', () => {
    const portrait = 3 / 4 // visible share of the height in a 4:3 box = 0.75 / 1.333 = 0.5625
    expect(coverPosition({ x: 0.5, y: 0.5 }, portrait).y).toBeCloseTo(0.5)
    expect(coverPosition({ x: 0.2, y: 0.5 }, portrait).x).toBe(0.5) // the width fits, so there is nothing to choose
    // A head 30% down: the window's own center lands on 30%.
    const p = coverPosition({ x: 0.5, y: 0.3 }, portrait)
    const visible = portrait / BOX_ASPECT
    expect(p.y * (1 - visible) + visible / 2).toBeCloseTo(0.3)
  })

  it('stops at the edge when the point is too close to it', () => {
    expect(coverPosition({ x: 0.5, y: 0.05 }, 3 / 4).y).toBe(0) // top edge
    expect(coverPosition({ x: 0.5, y: 0.97 }, 3 / 4).y).toBe(1) // bottom edge
  })

  it('crops a wide photo from the left and right', () => {
    const wide = 2
    expect(coverPosition({ x: 0.5, y: 0.1 }, wide)).toEqual({ x: 0.5, y: 0.5 })
    expect(coverPosition({ x: 0.9, y: 0.5 }, wide).x).toBe(1)
    expect(coverPosition({ x: 0.1, y: 0.5 }, wide).x).toBe(0)
  })

  it('always keeps the chosen point in view, whatever the photo and point', () => {
    const rng = seededRng(3)
    for (let i = 0; i < 400; i++) {
      const aspect = 0.4 + rng() * 2.4
      const focus = { x: rng(), y: rng() }
      const p = coverPosition(focus, aspect)
      if (aspect > BOX_ASPECT) {
        const v = BOX_ASPECT / aspect
        const start = p.x * (1 - v)
        expect(focus.x).toBeGreaterThanOrEqual(start - 1e-9)
        expect(focus.x).toBeLessThanOrEqual(start + v + 1e-9)
      } else if (aspect < BOX_ASPECT) {
        const v = aspect / BOX_ASPECT
        const start = p.y * (1 - v)
        expect(focus.y).toBeGreaterThanOrEqual(start - 1e-9)
        expect(focus.y).toBeLessThanOrEqual(start + v + 1e-9)
      }
    }
  })

  it('works for other box shapes (the share card is a little different from 4:3)', () => {
    expect(coverPosition({ x: 0.5, y: 0.2 }, 3 / 4, 920 / 690).y).toBeLessThan(0.5)
  })

  it('ignores impossible shapes', () => {
    expect(coverPosition({ x: 0.1, y: 0.1 }, 0)).toEqual(CENTER)
    expect(coverPosition({ x: 0.1, y: 0.1 }, Number.NaN)).toEqual(CENTER)
  })
})

describe('objectPosition: the CSS for an <img>', () => {
  it('turns the window into percentages', () => {
    expect(objectPosition({ x: 0.5, y: 0.5 }, 300, 400)).toBe('50% 50%')
    expect(objectPosition({ x: 0.5, y: 0.05 }, 300, 400)).toBe('50% 0%') // a head near the top: keep the top
    expect(objectPosition({ x: 0.97, y: 0.5 }, 800, 400)).toBe('100% 50%')
  })

  it('falls back to the center for a photo with no size', () => {
    expect(objectPosition({ x: 0.1, y: 0.1 }, 0, 0)).toBe('50% 50%')
  })
})
