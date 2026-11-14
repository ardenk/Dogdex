export function GoalRing({ count, target }: { count: number; target: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const pct = Math.min(1, target > 0 ? count / target : 0)
  return (
    <div className="ring" role="img" aria-label={`${count} of ${target} dogs logged this week`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--paper-sunk)" strokeWidth="10" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="ring__label" aria-hidden="true">
        {count}/{target}
      </span>
    </div>
  )
}
