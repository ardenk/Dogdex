import { Link } from 'react-router'
import { PhotoStack } from '../../components/PhotoStack'
import { RarityMark } from '../../components/RarityMark'
import { Silhouette } from '../../components/Silhouette'
import { entryNumber, groupsById } from '../../data'
import { entryLabel } from '../../domain/format'
import type { Tile } from '../../domain/dogdexTiles'

/** One breed card in the Dogdex grid: the photo stack (or the group's silhouette), number, name and rarity. */
export function BreedTileCard({ tile }: { tile: Tile }) {
  const { breed, count } = tile
  // A typed-in breed is filed under a category the user chose; a listed breed carries its own.
  const silhouetteGroup = breed?.groupId ?? (tile.groupId && groupsById[tile.groupId] ? tile.groupId : 'mixed')
  const label = breed
    ? `${breed.name}, ${entryLabel(entryNumber[breed.id])}, ${count ? `${count} met` : 'not met yet'}`
    : `${tile.name}, custom breed, ${count} met`

  return (
    <Link to={tile.href} className={`breed-card ${count ? 'breed-card--logged' : ''}`} aria-label={label}>
      {count > 0 && (
        <span className="breed-card__count" aria-hidden="true">
          {count}
        </span>
      )}
      <span className="breed-card__art">
        {tile.photoIds.length > 0 ? <PhotoStack photoIds={tile.photoIds} /> : <Silhouette variant={silhouetteGroup} />}
      </span>
      <span className="breed-card__no" aria-hidden="true">
        {breed ? entryLabel(entryNumber[breed.id]) : 'Added by you'}
      </span>
      <span className="breed-card__name" aria-hidden="true">
        {tile.name}
      </span>
      {breed && (
        <span aria-hidden="true">
          <RarityMark rarity={breed.rarity} />
        </span>
      )}
    </Link>
  )
}
