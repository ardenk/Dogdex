type Ear = 'floppy' | 'long' | 'point' | 'rose' | 'round'
type Tail = 'up' | 'curl' | 'down' | 'plume'

interface Shape {
  bodyX: number
  bodyW: number
  bodyH: number
  legH: number
  headR: number
  snout: number
  ear: Ear
  tail: Tail
}

/** One simple profile per AKC group. Per-breed art can override this later via the data files. */
const SHAPES: Record<string, Shape> = {
  sporting: { bodyX: 22, bodyW: 52, bodyH: 26, legH: 22, headR: 12, snout: 20, ear: 'floppy', tail: 'up' },
  hound: { bodyX: 18, bodyW: 58, bodyH: 22, legH: 20, headR: 11, snout: 24, ear: 'long', tail: 'up' },
  working: { bodyX: 22, bodyW: 54, bodyH: 32, legH: 20, headR: 14, snout: 18, ear: 'point', tail: 'curl' },
  terrier: { bodyX: 24, bodyW: 46, bodyH: 24, legH: 18, headR: 11, snout: 20, ear: 'rose', tail: 'up' },
  toy: { bodyX: 30, bodyW: 34, bodyH: 20, legH: 14, headR: 13, snout: 12, ear: 'round', tail: 'curl' },
  'non-sporting': { bodyX: 26, bodyW: 42, bodyH: 30, legH: 16, headR: 14, snout: 12, ear: 'point', tail: 'down' },
  herding: { bodyX: 20, bodyW: 54, bodyH: 26, legH: 24, headR: 12, snout: 20, ear: 'point', tail: 'plume' },
  mixed: { bodyX: 22, bodyW: 50, bodyH: 26, legH: 20, headR: 12, snout: 18, ear: 'floppy', tail: 'down' },
}

const GROUND = 82

function Ear({ kind, hx, hy, r }: { kind: Ear; hx: number; hy: number; r: number }) {
  switch (kind) {
    case 'floppy':
      return <ellipse cx={hx - r * 0.15} cy={hy + r * 0.35} rx={r * 0.45} ry={r * 0.85} transform={`rotate(14 ${hx} ${hy})`} />
    case 'long':
      return <ellipse cx={hx - r * 0.2} cy={hy + r * 0.7} rx={r * 0.4} ry={r * 1.3} transform={`rotate(8 ${hx} ${hy})`} />
    case 'point':
      return <polygon points={`${hx - r * 0.75},${hy - r * 0.5} ${hx - r * 0.2},${hy - r * 2} ${hx + r * 0.3},${hy - r * 0.75}`} />
    case 'rose':
      return <polygon points={`${hx - r * 0.85},${hy - r * 0.3} ${hx - r * 0.35},${hy - r * 1.35} ${hx + r * 0.15},${hy - r * 0.6}`} />
    case 'round':
      return <circle cx={hx - r * 0.3} cy={hy - r * 1.05} r={r * 0.6} />
  }
}

function tailPath(kind: Tail, x: number, y: number): { d: string; w: number } {
  switch (kind) {
    case 'up':
      return { d: `M${x + 4},${y + 8} Q${x - 10},${y} ${x - 14},${y - 18}`, w: 5 }
    case 'curl':
      return { d: `M${x + 4},${y + 6} C${x - 12},${y - 4} ${x - 4},${y - 24} ${x + 12},${y - 14}`, w: 5 }
    case 'down':
      return { d: `M${x + 4},${y + 8} Q${x - 10},${y + 14} ${x - 12},${y + 30}`, w: 5 }
    case 'plume':
      return { d: `M${x + 4},${y + 8} Q${x - 16},${y + 4} ${x - 12},${y - 20}`, w: 10 }
  }
}

export function Silhouette({ variant, className }: { variant: string; className?: string }) {
  const s = SHAPES[variant] ?? SHAPES.mixed
  const by = GROUND - s.legH - s.bodyH
  const hx = s.bodyX + s.bodyW + s.headR * 0.2
  const hy = by - s.headR * 0.25
  const tail = tailPath(s.tail, s.bodyX, by)
  const legW = 7
  const legX = [s.bodyX + 3, s.bodyX + 12, s.bodyX + s.bodyW - 20, s.bodyX + s.bodyW - 11]
  return (
    <svg className={`silhouette ${className ?? ''}`} viewBox="0 0 120 90" aria-hidden="true" focusable="false" fill="currentColor">
      <path d={tail.d} fill="none" stroke="currentColor" strokeWidth={tail.w} strokeLinecap="round" />
      {legX.map((x) => (
        <rect key={x} x={x} y={by + s.bodyH - 6} width={legW} height={s.legH + 6} rx={3} />
      ))}
      <rect x={s.bodyX} y={by} width={s.bodyW} height={s.bodyH} rx={s.bodyH / 2.2} />
      <ellipse cx={s.bodyX + s.bodyW - 6} cy={by + s.bodyH * 0.35} rx={s.headR * 0.75} ry={s.bodyH * 0.55} />
      <circle cx={hx} cy={hy} r={s.headR} />
      <rect x={hx + s.headR * 0.3} y={hy - s.headR * 0.15} width={s.snout} height={s.headR * 0.95} rx={s.headR * 0.4} />
      <Ear kind={s.ear} hx={hx} hy={hy} r={s.headR} />
    </svg>
  )
}
