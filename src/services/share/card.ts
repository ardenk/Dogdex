import { CENTER, coverPosition } from '../../domain/photoFocus'
import type { Focus } from '../../domain/photoFocus'
import { silhouetteDataUrl } from './silhouetteSvg'

export interface CardInput {
  /** Dog's name, or e.g. "Unnamed Beagle". */
  title: string
  breedName: string
  groupId: string
  rarityLabel: string
  rarityGlyph: string
  /** "rare" gets the bold accent treatment. */
  rarityId: string
  entryLabel: string
  photo?: Blob
  /** Where the dog is in the photo, so the crop to the card's frame keeps it in view. Centered when omitted. */
  photoFocus?: Focus
  metAt: number
  /** Neighborhood. Only drawn when provided; the share screen defaults to leaving it off. */
  place?: string
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

// Mirrors src/styles/tokens.css
const C = { paper: '#f3ede0', sunk: '#e8e0cd', ink: '#1b1a17', soft: '#4a463e', accent: '#c2361b', white: '#ffffff' }
const DISPLAY = '"Space Grotesk", system-ui, sans-serif'
const MONO = '"DM Mono", ui-monospace, monospace'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, weight: number): string {
  let px = startPx
  ctx.font = `${weight} ${px}px ${DISPLAY}`
  while (ctx.measureText(text).width > maxWidth && px > minPx) {
    px -= 2
    ctx.font = `${weight} ${px}px ${DISPLAY}`
  }
  let out = text
  while (ctx.measureText(out).width > maxWidth && out.length > 1) out = out.slice(0, -1)
  return out === text ? text : `${out.trimEnd()}…`
}

/** Renders a 1080×1350 PNG card for one dog. Everything is drawn from local data; nothing leaves the device. */
export async function renderShareCard(input: CardInput): Promise<Blob> {
  // Make sure the webfonts are ready before drawing text.
  await Promise.all([
    document.fonts.load(`700 80px ${DISPLAY}`),
    document.fonts.load(`500 40px ${DISPLAY}`),
    document.fonts.load(`500 36px ${MONO}`),
  ]).catch(() => undefined)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  // Paper + frame
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.lineWidth = 12
  ctx.strokeStyle = C.ink
  roundRect(ctx, 24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48, 44)
  ctx.stroke()

  // Header band
  ctx.save()
  roundRect(ctx, 24, 24, CARD_WIDTH - 48, 120, 44)
  ctx.clip()
  ctx.fillStyle = C.accent
  ctx.fillRect(24, 24, CARD_WIDTH - 48, 120)
  ctx.restore()
  ctx.fillStyle = C.white
  ctx.textBaseline = 'middle'
  ctx.font = `700 54px ${DISPLAY}`
  ctx.textAlign = 'left'
  ctx.fillText('DOGDEX', 80, 86)
  ctx.font = `500 40px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillText(input.entryLabel.toUpperCase(), CARD_WIDTH - 80, 86)

  // Photo (or silhouette) frame with a hard shadow
  const fx = 80
  const fy = 190
  const fw = CARD_WIDTH - 160
  const fh = 690
  ctx.fillStyle = C.ink
  roundRect(ctx, fx + 12, fy + 12, fw, fh, 28)
  ctx.fill()
  ctx.save()
  roundRect(ctx, fx, fy, fw, fh, 28)
  ctx.clip()
  ctx.fillStyle = C.sunk
  ctx.fillRect(fx, fy, fw, fh)
  if (input.photo) {
    const bmp = await createImageBitmap(input.photo)
    const scale = Math.max(fw / bmp.width, fh / bmp.height)
    const dw = bmp.width * scale
    const dh = bmp.height * scale
    // The photo overflows the frame along one axis; the focus decides how much of that overflow is cut from each side.
    const at = coverPosition(input.photoFocus ?? CENTER, bmp.width / bmp.height, fw / fh)
    ctx.drawImage(bmp, fx - at.x * (dw - fw), fy - at.y * (dh - fh), dw, dh)
    bmp.close()
  } else {
    const sil = await loadImage(silhouetteDataUrl(input.groupId, C.soft))
    const sw = 560
    const sh = (sw * 360) / 480
    ctx.drawImage(sil, fx + (fw - sw) / 2, fy + (fh - sh) / 2, sw, sh)
  }
  ctx.restore()
  ctx.lineWidth = 8
  ctx.strokeStyle = C.ink
  roundRect(ctx, fx, fy, fw, fh, 28)
  ctx.stroke()

  // Name + breed
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.ink
  const title = fitText(ctx, input.title, fw, 96, 52, 700)
  ctx.fillText(title, fx, 1000)
  ctx.fillStyle = C.soft
  ctx.font = `500 48px ${DISPLAY}`
  ctx.fillText(fitText(ctx, input.breedName, fw, 48, 32, 500), fx, 1064)

  // Rarity pill
  const pillText = `${input.rarityGlyph} ${input.rarityLabel.toUpperCase()}`
  ctx.font = `500 38px ${MONO}`
  const pw = ctx.measureText(pillText).width + 64
  roundRect(ctx, fx, 1100, pw, 70, 35)
  if (input.rarityId === 'rare') {
    ctx.fillStyle = C.accent
    ctx.fill()
    ctx.fillStyle = C.white
  } else {
    ctx.lineWidth = 4
    ctx.strokeStyle = C.ink
    ctx.stroke()
    ctx.fillStyle = C.ink
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(pillText, fx + 32, 1136)

  // Meta line
  const date = new Date(input.metAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const meta = ['Met ' + date, input.place].filter(Boolean).join('  ·  ')
  ctx.fillStyle = C.soft
  ctx.font = `400 36px ${MONO}`
  ctx.textBaseline = 'alphabetic'
  let shown = meta
  while (ctx.measureText(shown).width > fw && shown.length > 1) shown = shown.slice(0, -1)
  ctx.fillText(shown === meta ? meta : `${shown.trimEnd()}…`, fx, 1240)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode card'))), 'image/png'))
}
