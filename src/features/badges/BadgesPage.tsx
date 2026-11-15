import { useMemo } from 'react'
import { data } from '../../data'
import { computeStats, evaluateBadges } from '../../domain/badges/engine'
import { formatDate } from '../../domain/format'
import { useData } from '../../storage/data-context'

export function BadgesPage() {
  const { snapshot, settings } = useData()
  const progress = useMemo(() => evaluateBadges(data.badges, computeStats(snapshot, data.breeds, settings.quizStats)), [snapshot, settings.quizStats])
  const awardedAt = new Map(snapshot.awards.map((a) => [a.badgeId, a.earnedAt]))
  const earnedCount = progress.filter((p) => p.earned).length

  return (
    <main className="page">
      <header>
        <span className="eyebrow">
          {earnedCount} of {progress.length} earned
        </span>
        <h1>Badges</h1>
      </header>
      <ul className="badge-grid">
        {progress.map((p) => (
          <li key={p.badge.id} className={`badge ${p.earned ? 'badge--earned' : ''}`}>
            <span className="badge__seal" aria-hidden="true">
              {p.badge.glyph}
            </span>
            <h2 style={{ fontSize: '1rem' }}>{p.badge.name}</h2>
            <p className="small">{p.badge.description}</p>
            {p.earned ? (
              <p className="small mono">
                Earned{awardedAt.get(p.badge.id) ? ` ${formatDate(awardedAt.get(p.badge.id)!)}` : ''}
              </p>
            ) : (
              <>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={p.target} aria-valuenow={p.current} aria-label={`${p.badge.name} progress`}>
                  <span style={{ width: `${(p.current / p.target) * 100}%` }} />
                </div>
                <p className="small mono">
                  {p.current}/{p.target}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
