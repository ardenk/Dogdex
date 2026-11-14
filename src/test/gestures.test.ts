import { describe, expect, it } from 'vitest'
import { dragPose, normalizeDeg, pinchPose } from '../domain/gestures'

const box = { w: 400, h: 300 }
const start = { x: 0.5, y: 0.5, scale: 0.3, rotation: 0 }

describe('normalizeDeg', () => {
  it('wraps angles into (-180, 180]', () => {
    expect(normalizeDeg(0)).toBe(0)
    expect(normalizeDeg(190)).toBe(-170)
    expect(normalizeDeg(-190)).toBe(170)
    expect(normalizeDeg(360)).toBe(0)
    expect(normalizeDeg(540)).toBe(180)
    expect(normalizeDeg(-180)).toBe(180)
  })
})

describe('one-finger drag', () => {
  it('moves by how far the finger moved, as a fraction of the photo box', () => {
    const p = dragPose(start, { x: 100, y: 100 }, { x: 140, y: 130 }, box)
    expect(p.x).toBeCloseTo(0.6)
    expect(p.y).toBeCloseTo(0.6)
    expect([p.scale, p.rotation]).toEqual([0.3, 0])
  })
  it('stays on the photo', () => {
    const p = dragPose(start, { x: 0, y: 0 }, { x: 9999, y: -9999 }, box)
    expect([p.x, p.y]).toEqual([1, 0])
  })
})

describe('two-finger pinch and twist', () => {
  const a0 = { x: 100, y: 100 }
  const b0 = { x: 200, y: 100 } // fingers 100px apart, level

  it('spreading the fingers makes the sticker bigger by the same ratio', () => {
    const p = pinchPose(start, a0, b0, { x: 50, y: 100 }, { x: 250, y: 100 }, box)
    expect(p.scale).toBeCloseTo(0.6)
    expect(p.rotation).toBeCloseTo(0)
    expect([p.x, p.y]).toEqual([0.5, 0.5]) // midpoint didn't move
  })
  it('pinching the fingers together makes it smaller', () => {
    expect(pinchPose(start, a0, b0, { x: 125, y: 100 }, { x: 175, y: 100 }, box).scale).toBeCloseTo(0.15)
  })
  it('limits the size', () => {
    expect(pinchPose(start, a0, b0, a0, { x: 2000, y: 100 }, box).scale).toBe(1)
    expect(pinchPose(start, a0, b0, a0, { x: 100.5, y: 100 }, box).scale).toBe(0.05)
  })
  it('twisting the fingers rotates the sticker the same number of degrees', () => {
    // second finger swings from "right of" the first to "below" it: +90 degrees clockwise on screen
    const p = pinchPose(start, a0, b0, a0, { x: 100, y: 200 }, box)
    expect(p.rotation).toBeCloseTo(90)
    expect(p.scale).toBeCloseTo(0.3)
    const q = pinchPose({ ...start, rotation: 170 }, a0, b0, a0, { x: 100, y: 200 }, box)
    expect(q.rotation).toBeCloseTo(-100) // 170 + 90 wraps past 180
  })
  it('moving both fingers together moves the sticker', () => {
    const p = pinchPose(start, a0, b0, { x: 140, y: 130 }, { x: 240, y: 130 }, box)
    expect(p.x).toBeCloseTo(0.6)
    expect(p.y).toBeCloseTo(0.6)
    expect(p.scale).toBeCloseTo(0.3)
  })
  it('does all three at once', () => {
    const p = pinchPose(start, a0, b0, { x: 100, y: 100 }, { x: 100, y: 300 }, box)
    expect(p.scale).toBeCloseTo(0.6) // 200px apart now vs 100px
    expect(p.rotation).toBeCloseTo(90)
  })
  it('survives fingers that start on the same spot', () => {
    const p = pinchPose(start, a0, a0, a0, { x: 150, y: 100 }, box)
    expect(Number.isFinite(p.scale)).toBe(true)
    expect(p.scale).toBeLessThanOrEqual(1)
  })
})
