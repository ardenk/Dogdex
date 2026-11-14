/**
 * Only GIPHY-hosted https images are ever stored, synced or rendered. This keeps a tampered record from
 * pointing the app at an arbitrary (tracking) URL. The database has a matching check constraint.
 */
export function isGiphyUrl(value: string | undefined | null): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && (u.hostname === 'giphy.com' || u.hostname.endsWith('.giphy.com'))
  } catch {
    return false
  }
}
