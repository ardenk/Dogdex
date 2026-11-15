export interface ProcessedImage {
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality),
  )
}

async function drawScaled(bitmap: ImageBitmap, maxDim: number): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Longest side of the copy sent for breed identification: enough detail for a breed, small and cheap to upload. */
export const IDENTIFY_MAX_DIM = 800

/** A small JPEG of the photo as base64 text (no data-URL prefix), for the breed identification service. */
export async function photoForIdentification(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const blob = await toBlob(await drawScaled(bitmap, IDENTIFY_MAX_DIM), 0.8)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
  } finally {
    bitmap.close()
  }
}

/**
 * Shrinks a photo from the camera or library to ~1280px (saves storage space) and makes a 320px thumbnail.
 * Strips EXIF metadata, including any embedded GPS, as a side effect of re-encoding through a canvas.
 */
export async function processImage(file: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const full = await drawScaled(bitmap, 1280)
    const small = await drawScaled(bitmap, 320)
    return {
      blob: await toBlob(full, 0.82),
      thumb: await toBlob(small, 0.75),
      width: full.width,
      height: full.height,
    }
  } finally {
    bitmap.close()
  }
}
