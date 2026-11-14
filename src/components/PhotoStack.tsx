import { usePhotoUrl } from '../storage/usePhotoUrl'

function StackPhoto({ photoId, depth }: { photoId: string; depth: number }) {
  const url = usePhotoUrl(photoId, 'thumb')
  const cls = `photo-stack__item photo-stack__item--${depth}`
  // While the thumbnail loads, show a quiet placeholder so the stack doesn't jump.
  return url ? <img className={cls} src={url} alt="" style={{ zIndex: 3 - depth }} /> : <span className={cls} style={{ zIndex: 3 - depth }} />
}

/**
 * Up to three photos fanned out like a small pile. `photoIds[0]` is the top photo (the most recently seen dog).
 * Decorative: the tile it sits in carries the accessible label.
 */
export function PhotoStack({ photoIds }: { photoIds: string[] }) {
  return (
    <span className="photo-stack" data-count={photoIds.length} aria-hidden="true">
      {/* Draw the back photos first so the top one is last in the DOM too. */}
      {[...photoIds].reverse().map((id, i) => (
        <StackPhoto key={id} photoId={id} depth={photoIds.length - 1 - i} />
      ))}
    </span>
  )
}
