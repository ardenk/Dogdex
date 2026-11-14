/**
 * Coarse location, neighborhood level only.
 *
 * Privacy rules enforced here:
 *  - Coordinates are rounded to 2 decimals (~1 km) BEFORE anything else happens to them.
 *  - Only the rounded values are sent to the reverse-geocoding service.
 *  - Only the neighborhood label and rounded cell are stored. Raw coordinates are discarded.
 */

export interface CoarseLocation {
  placeLabel?: string
  /** "lat,lon" rounded to 2 decimals */
  geoCell: string
}

export const roundCoord = (n: number): number => Math.round(n * 100) / 100

export const toGeoCell = (lat: number, lon: number): string => `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`

type Address = Record<string, string | undefined>

/** "Tribeca, New York" style label from a Nominatim address object. */
export function labelFromAddress(address: Address): string | undefined {
  const hood = address.neighbourhood ?? address.suburb ?? address.quarter ?? address.city_district ?? address.borough
  const city = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.municipality ?? address.county
  const parts = [hood, city].filter((p): p is string => !!p)
  const unique = parts.filter((p, i) => parts.indexOf(p) === i)
  if (unique.length) return unique.join(', ')
  return address.state
}

const labelCache = new Map<string, string | undefined>()
let lastFix: { at: number; value: CoarseLocation } | null = null
const FIX_TTL_MS = 10 * 60 * 1000

async function reverseGeocode(cell: string, signal?: AbortSignal): Promise<string | undefined> {
  if (labelCache.has(cell)) return labelCache.get(cell)
  const [lat, lon] = cell.split(',')
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return undefined
    const json = (await res.json()) as { address?: Address }
    const label = json.address ? labelFromAddress(json.address) : undefined
    labelCache.set(cell, label)
    return label
  } catch {
    return undefined
  }
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation unavailable'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: FIX_TTL_MS,
    })
  })
}

/**
 * Resolves to a coarse location or null (permission denied, offline, unsupported).
 * Never throws, so callers can fire it in the background without blocking a save.
 */
export async function getCoarseLocation(signal?: AbortSignal): Promise<CoarseLocation | null> {
  if (lastFix && Date.now() - lastFix.at < FIX_TTL_MS) return lastFix.value
  try {
    const pos = await currentPosition()
    const geoCell = toGeoCell(pos.coords.latitude, pos.coords.longitude) // raw coords end here
    const placeLabel = await reverseGeocode(geoCell, signal)
    const value: CoarseLocation = { geoCell, placeLabel }
    lastFix = { at: Date.now(), value }
    return value
  } catch {
    return null
  }
}
