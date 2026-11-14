import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { dragPose, pinchPose } from '../domain/gestures'
import type { Pose, Pt } from '../domain/gestures'
import type { Sticker } from '../domain/types'
import { isGiphyUrl } from '../services/giphy/validate'

interface Props {
  stickers: Sticker[]
  /** Editing makes stickers movable: touch (one finger to drag, two to resize and rotate), mouse, and keyboard. */
  editing?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** Called when a gesture or key press finishes with the sticker's new placement. */
  onChange?: (id: string, patch: Partial<Pose>) => void
  /** Small lists (thumbnails) hide sticker descriptions from screen readers to avoid noise. */
  decorative?: boolean
}

interface Gesture {
  id: string
  mode: 'drag' | 'pinch'
  start: Pose
  /** The pointers taking part, in order, and where they were when this gesture (re)started. */
  pointerIds: number[]
  origins: Pt[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const poseOf = (s: Sticker): Pose => ({ x: s.x, y: s.y, scale: s.scale, rotation: s.rotation })

/**
 * Draws stickers over its parent, which must be `position: relative` (the photo box).
 * Positions and sizes are fractions of that box, so they look the same at any size.
 *
 * Gestures use Pointer Events on the layer: one finger on a sticker drags it; a second finger
 * (anywhere on the photo) while a sticker is selected switches to pinch-to-resize and twist-to-rotate.
 */
export function StickerLayer({ stickers, editing = false, selectedId = null, onSelect, onChange, decorative = false }: Props) {
  const layer = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Pt>())
  const gesture = useRef<Gesture | null>(null)
  const liveRef = useRef<({ id: string } & Pose) | null>(null)
  const [live, setLive] = useState<({ id: string } & Pose) | null>(null)
  const visible = [...stickers].filter((s) => isGiphyUrl(s.url)).sort((a, b) => a.z - b.z)

  const setLivePose = (v: ({ id: string } & Pose) | null) => {
    liveRef.current = v
    setLive(v)
  }

  const begin = (mode: Gesture['mode'], id: string) => {
    const sticker = stickers.find((s) => s.id === id)
    if (!sticker) return
    const pointerIds = [...pointers.current.keys()].slice(0, mode === 'pinch' ? 2 : 1)
    if (pointerIds.length < (mode === 'pinch' ? 2 : 1)) return
    const start = liveRef.current?.id === id ? liveRef.current : poseOf(sticker) // continue from where the last gesture left off
    gesture.current = { id, mode, start: { x: start.x, y: start.y, scale: start.scale, rotation: start.rotation }, pointerIds, origins: pointerIds.map((p) => pointers.current.get(p)!) }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!editing) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-sticker-id]')
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      layer.current?.setPointerCapture(e.pointerId) // keep receiving moves even if the finger leaves the photo
    } catch {
      /* synthetic or already-released pointers can't be captured; the gesture still works */
    }
    if (pointers.current.size === 1) {
      if (el?.dataset.stickerId) {
        onSelect?.(el.dataset.stickerId)
        begin('drag', el.dataset.stickerId)
      } else {
        onSelect?.(null)
        gesture.current = null
      }
    } else if (pointers.current.size === 2) {
      const id = gesture.current?.id ?? selectedId
      if (id) begin('pinch', id)
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!editing || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const rect = layer.current?.getBoundingClientRect()
    if (!g || !rect || rect.width === 0 || rect.height === 0) return
    const box = { w: rect.width, h: rect.height }
    const now = g.pointerIds.map((p) => pointers.current.get(p))
    if (now.some((p) => !p)) return
    const pose =
      g.mode === 'drag'
        ? dragPose(g.start, g.origins[0], now[0]!, box)
        : pinchPose(g.start, g.origins[0], g.origins[1], now[0]!, now[1]!, box)
    setLivePose({ id: g.id, ...pose })
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (!g) return
    if (g.mode === 'pinch' && pointers.current.size === 1) {
      // One finger lifted: carry on dragging with the other, from where the sticker is now.
      begin('drag', g.id)
      return
    }
    if (pointers.current.size === 0) {
      const l = liveRef.current
      gesture.current = null
      setLivePose(null)
      if (l) onChange?.(l.id, { x: l.x, y: l.y, scale: l.scale, rotation: l.rotation })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, s: Sticker) => {
    if (!editing) return
    const step = e.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      onChange?.(s.id, { x: clamp01(s.x + m[0]), y: clamp01(s.y + m[1]) })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(s.id)
    }
  }

  return (
    <div
      ref={layer}
      className={`sticker-layer ${editing ? 'sticker-layer--editing' : ''}`}
      {...(editing ? { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } : {})}
    >
      {visible.map((s) => {
        const pose = live?.id === s.id ? live : poseOf(s)
        const selected = editing && selectedId === s.id
        const label = s.title || 'Sticker'
        return (
          <div
            key={s.id}
            data-sticker-id={s.id}
            className={`sticker ${selected ? 'sticker--selected' : ''}`}
            style={{ left: `${pose.x * 100}%`, top: `${pose.y * 100}%`, width: `${pose.scale * 100}%`, aspectRatio: `${s.width} / ${s.height}`, transform: `translate(-50%, -50%) rotate(${pose.rotation}deg)` }}
            {...(editing
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': selected,
                  'aria-label': `${label}. Drag or use the arrow keys to move.`,
                  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => onKeyDown(e, s),
                }
              : {})}
          >
            <picture>
              {s.stillUrl && isGiphyUrl(s.stillUrl) && <source media="(prefers-reduced-motion: reduce)" srcSet={s.stillUrl} />}
              <img src={s.url} alt={decorative || editing ? '' : label} draggable={false} decoding="async" loading="lazy" referrerPolicy="no-referrer" />
            </picture>
          </div>
        )
      })}
    </div>
  )
}
