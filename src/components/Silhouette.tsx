import { SILHOUETTE_ART } from './silhouetteArt'

/**
 * The placeholder dog drawn for a breed or dog without a photo: one profile per AKC group, taken from the
 * Figma design. Per-breed art can override this later via the data files. Falls back to the Mixed & Designer dog.
 */
export function Silhouette({ variant, className }: { variant: string; className?: string }) {
  // The markup is a fixed constant from our own source (silhouetteArt.ts), never user input.
  return (
    <svg
      className={`silhouette ${className ?? ''}`}
      viewBox="0 0 120 90"
      fill="none" /* tails are open strokes: without this the browser fills the curve */
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: SILHOUETTE_ART[variant] ?? SILHOUETTE_ART.mixed }}
    />
  )
}
