/**
 * Choosing which part of a photo stays in view when it is cropped to fit a box (the dog page, tiles, share cards).
 * A "focus" is a point in the photo, as fractions of its width and height, that the crop is centered on where it can be.
 */
export interface Focus {
  x: number
  y: number
}

export const CENTER: Focus = { x: 0.5, y: 0.5 }

/** The box every photo is cropped to: 4:3 (the dog page, tiles, the strip and the share card all use it). */
export const BOX_ASPECT = 4 / 3

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5)

export function clampFocus(f: Focus): Focus {
  return { x: clamp01(f.x), y: clamp01(f.y) }
}

/** The focus saved on a photo, or the center when none was set. */
export function focusOf(photo: { focusX?: number | null; focusY?: number | null } | undefined): Focus {
  return photo && photo.focusX != null && photo.focusY != null ? clampFocus({ x: photo.focusX, y: photo.focusY }) : CENTER
}

export const isCentered = (f: Focus): boolean => Math.abs(f.x - 0.5) < 0.005 && Math.abs(f.y - 0.5) < 0.005

/**
 * Where the visible window sits along each axis (0 = start edge, 1 = end edge) when a photo of `imageAspect`
 * (width / height) is cropped to fill a box of `boxAspect`, centered on `focus` as far as the edges allow.
 * Only one axis overflows; the other has nothing to choose, so it stays at 0.5.
 */
export function coverPosition(focus: Focus, imageAspect: number, boxAspect: number = BOX_ASPECT): Focus {
  const f = clampFocus(focus)
  if (!(imageAspect > 0) || !(boxAspect > 0)) return CENTER
  const along = (point: number, visible: number) => (visible >= 1 ? 0.5 : Math.min(1, Math.max(0, (point - visible / 2) / (1 - visible))))
  if (imageAspect > boxAspect) return { x: along(f.x, boxAspect / imageAspect), y: 0.5 } // wider than the box: crops left and right
  if (imageAspect < boxAspect) return { x: 0.5, y: along(f.y, imageAspect / boxAspect) } // taller than the box: crops top and bottom
  return CENTER
}

/** The CSS `object-position` that does the above for an <img> with object-fit: cover. */
export function objectPosition(focus: Focus, imageWidth: number, imageHeight: number, boxAspect: number = BOX_ASPECT): string {
  const p = coverPosition(focus, imageHeight > 0 ? imageWidth / imageHeight : 0, boxAspect)
  const pct = (n: number) => Number((n * 100).toFixed(1)) // 50, not 50.0
  return `${pct(p.x)}% ${pct(p.y)}%`
}
