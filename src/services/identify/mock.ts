import { data } from '../../data'
import type { BreedIdentifier, RawPrediction } from './index'

/** Small, fast, deterministic hash of the image bytes (FNV-1a over a sample of the file). */
async function hashBlob(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer())
  let h = 2166136261 ^ blob.size
  for (const b of bytes) {
    h ^= b
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Demo identifier. It does NOT look at the dog. The same photo always gets the same three
 * breeds, so the guess-then-reveal flow can be built and tested. Replace with a real model later.
 */
export const mockIdentifier: BreedIdentifier = {
  id: 'mock-v1',
  label: 'Demo suggestions (not a real model)',
  async identify(image: Blob): Promise<RawPrediction[]> {
    await new Promise((r) => setTimeout(r, 450)) // feel like work happened
    const seed = await hashBlob(image)
    const pool = data.breeds.filter((b) => b.id !== 'mixed-breed')
    const picks: string[] = []
    let s = seed
    while (picks.length < 3) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      const id = pool[s % pool.length].id
      if (!picks.includes(id)) picks.push(id)
    }
    return [
      { breed: picks[0], confidence: 0.58 + (seed % 20) / 100 },
      { breed: picks[1], confidence: 0.14 + (seed % 9) / 100 },
      { breed: picks[2], confidence: 0.06 + (seed % 5) / 100 },
    ]
  },
}
