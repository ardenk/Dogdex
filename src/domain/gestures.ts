/**
 * Pure math for touch gestures on a sticker. Positions are fractions (0–1) of the photo box,
 * so these work the same at any screen size. Pointer positions are in pixels.
 */
export interface Pt {
  x: number
  y: number
}

export interface Pose {
  x: number
  y: number
  scale: number
  rotation: number
}

export interface Box {
  w: number
  h: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 1

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
const angleDeg = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

/** Wraps any angle into (-180, 180]. */
export function normalizeDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180
  if (d === -180) d = 180
  return d
}

/** One finger: the sticker follows the finger by the distance it has moved, so it never jumps under the finger. */
export function dragPose(start: Pose, from: Pt, to: Pt, box: Box): Pose {
  return {
    ...start,
    x: clamp(start.x + (to.x - from.x) / box.w, 0, 1),
    y: clamp(start.y + (to.y - from.y) / box.h, 0, 1),
  }
}

/**
 * Two fingers: moving both together moves the sticker, spreading or pinching resizes it,
 * and twisting rotates it. (a0, b0) are the fingers at the start, (a1, b1) now, matched by finger.
 */
export function pinchPose(start: Pose, a0: Pt, b0: Pt, a1: Pt, b1: Pt, box: Box): Pose {
  const d0 = Math.max(1, dist(a0, b0)) // avoid dividing by ~0 if the fingers start on the same spot
  const ratio = dist(a1, b1) / d0
  const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
  return {
    x: clamp(start.x + (mid1.x - mid0.x) / box.w, 0, 1),
    y: clamp(start.y + (mid1.y - mid0.y) / box.h, 0, 1),
    scale: clamp(start.scale * ratio, MIN_SCALE, MAX_SCALE),
    rotation: normalizeDeg(start.rotation + angleDeg(a1, b1) - angleDeg(a0, b0)),
  }
}
