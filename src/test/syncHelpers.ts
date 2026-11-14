import { encounterToRemote } from '../sync/mappers'

export { dogFromRemote, dogToRemote, guessFromRemote, guessToRemote, toIso } from '../sync/mappers'

/** True when an encounter's remote payload only carries the rounded cell and a label. */
export function labelSafe(): boolean {
  const row = encounterToRemote(
    { id: 'e', dogId: 'd', metAt: 1, placeLabel: 'Tribeca', geoCell: '40.72,-74.01', createdAt: 1, updatedAt: 1 },
    'u',
  )
  const keys = Object.keys(row)
  return !keys.some((k) => /^(lat|lng|lon|latitude|longitude)/i.test(k)) && row.geo_cell === '40.72,-74.01'
}
