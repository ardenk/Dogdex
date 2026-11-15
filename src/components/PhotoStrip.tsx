import { usePhoto } from '../storage/usePhotoUrl'

interface Props {
  photoIds: string[]
  selectedId: string | undefined
  coverId: string | undefined
  onSelect: (id: string) => void
  /** Shows a "+" tile at the end that adds a photo. Omit to hide it. */
  onAdd?: () => void
  /** The add-a-photo controls are open. */
  adding?: boolean
  /** False once the dog has as many photos as it can have. */
  canAdd?: boolean
}

function Thumb({ id, index, total, selected, cover, onSelect }: { id: string; index: number; total: number; selected: boolean; cover: boolean; onSelect: (id: string) => void }) {
  const { url, style } = usePhoto(id, 'thumb')
  return (
    <button
      type="button"
      className="photo-strip__item"
      aria-pressed={selected}
      aria-label={`Photo ${index + 1} of ${total}${cover ? ', cover photo' : ''}`}
      onClick={() => onSelect(id)}
    >
      {url && <img src={url} alt="" style={style} />}
      {cover && (
        <span className="photo-strip__cover" aria-hidden="true">
          ★
        </span>
      )}
    </button>
  )
}

/** A row of small photos to switch between, ending in a "+" tile to add one. The cover photo is marked with a star. */
export function PhotoStrip({ photoIds, selectedId, coverId, onSelect, onAdd, adding = false, canAdd = true }: Props) {
  return (
    <ul className="photo-strip" aria-label="Photos of this dog">
      {photoIds.map((id, i) => (
        <li key={id}>
          <Thumb id={id} index={i} total={photoIds.length} selected={id === selectedId} cover={id === coverId} onSelect={onSelect} />
        </li>
      ))}
      {onAdd && (
        <li>
          {/* A stand-in for the next photo: it looks like a thumbnail but opens the add-a-photo controls. */}
          <button
            type="button"
            className="photo-strip__item photo-strip__add"
            aria-label={canAdd ? 'Add a photo' : 'Add a photo (this dog has the most photos it can have)'}
            aria-expanded={adding}
            disabled={!canAdd}
            onClick={onAdd}
          >
            <span aria-hidden="true">+</span>
          </button>
        </li>
      )}
    </ul>
  )
}
