import { Link } from 'react-router'
import { breedName, dogGroupId, dogTitle, formatDate } from '../domain/format'
import type { Dog } from '../domain/types'
import { usePhotoUrl } from '../storage/usePhotoUrl'
import { useData } from '../storage/data-context'
import { Silhouette } from './Silhouette'
import { StickerLayer } from './StickerLayer'

export function DogRow({ dog, encounterCount }: { dog: Dog; encounterCount?: number }) {
  const url = usePhotoUrl(dog.primaryPhotoId, 'thumb')
  const groupId = dogGroupId(dog)
  const { snapshot } = useData()
  const stickers = snapshot.stickers.filter((s) => s.dogId === dog.id)
  return (
    <Link to={`/dog/${dog.id}`} className="dog-row">
      <span className="thumb">
        {url ? <img src={url} alt="" /> : <Silhouette variant={groupId ?? 'mixed'} />}
        {stickers.length > 0 && <StickerLayer stickers={stickers} decorative />}
      </span>
      <span className="grow">
        <span className="dog-row__title">{dogTitle(dog)}</span>
        <br />
        <span className="muted small">
          {breedName(dog)} · {formatDate(dog.lastMetAt)}
          {encounterCount && encounterCount > 1 ? ` · met ${encounterCount}×` : ''}
        </span>
      </span>
    </Link>
  )
}
