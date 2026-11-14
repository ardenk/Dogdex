import { usePhotoUrl } from '../storage/usePhotoUrl'

interface Props {
  photoIds: string[]
  selectedId: string | undefined
  coverId: string | undefined
  onSelect: (id: string) => void
}

function Thumb({ id, index, total, selected, cover, onSelect }: { id: string; index: number; total: number; selected: boolean; cover: boolean; onSelect: (id: string) => void }) {
  const url = usePhotoUrl(id, 'thumb')
  return (
    <button
      type="button"
      className="photo-strip__item"
      aria-pressed={selected}
      aria-label={`Photo ${index + 1} of ${total}${cover ? ', cover photo' : ''}`}
      onClick={() => onSelect(id)}
    >
      {url && <img src={url} alt="" />}
      {cover && (
        <span className="photo-strip__cover" aria-hidden="true">
          ★
        </span>
      )}
    </button>
  )
}

/** A row of small photos to switch between. The cover photo is marked with a star. */
export function PhotoStrip({ photoIds, selectedId, coverId, onSelect }: Props) {
  return (
    <ul className="photo-strip" aria-label="Photos of this dog">
      {photoIds.map((id, i) => (
        <li key={id}>
          <Thumb id={id} index={i} total={photoIds.length} selected={id === selectedId} cover={id === coverId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}
