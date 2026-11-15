import { useMemo } from 'react'
import { Link } from 'react-router'
import { DogRow } from '../../components/DogRow'
import { GoalRing } from '../../components/GoalRing'
import { data } from '../../data'
import { computeStats, evaluateBadges } from '../../domain/badges/engine'
import { countThisWeek, goalMessage } from '../../domain/goals'
import { hasQuizSession } from '../quiz/session'
import { useData } from '../../storage/data-context'

export function HomePage() {
  const { snapshot, settings } = useData()
  const count = useMemo(() => countThisWeek(snapshot.encounters), [snapshot.encounters])
  const recent = useMemo(() => [...snapshot.dogs].sort((a, b) => b.lastMetAt - a.lastMetAt).slice(0, 4), [snapshot.dogs])
  const encounterCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of snapshot.encounters) m.set(e.dogId, (m.get(e.dogId) ?? 0) + 1)
    return m
  }, [snapshot.encounters])
  const quizInProgress = hasQuizSession()
  const stats = useMemo(() => computeStats(snapshot, data.breeds, settings.quizStats), [snapshot, settings.quizStats])
  const nextBadge = useMemo(
    () =>
      evaluateBadges(data.badges, stats)
        .filter((p) => !p.earned)
        .sort((a, b) => b.current / b.target - a.current / a.target)[0],
    [stats],
  )

  return (
    <main className="page">
      <header>
        <span className="eyebrow">Dogdex</span>
        <h1>Who did you meet?</h1>
      </header>

      <Link to="/log" className="btn btn--primary btn--big btn--block">
        Log a dog
      </Link>

      <section className="card row" aria-labelledby="goal-heading">
        <GoalRing count={count} target={settings.weeklyGoal} />
        <div>
          <h2 id="goal-heading">This week</h2>
          <p className="muted">{goalMessage(count, settings.weeklyGoal)}</p>
        </div>
      </section>

      <section className="card row row--between" aria-labelledby="quiz-heading">
        <div>
          <h2 id="quiz-heading">Breed quiz</h2>
          <p className="muted small">{quizInProgress ? 'You have a round in progress.' : 'Name the breed from a photo. Ten questions, no timer.'}</p>
        </div>
        <Link to="/quiz" className="btn btn--small">
          {quizInProgress ? 'Resume' : 'Play'}
        </Link>
      </section>

      <section className="stack" aria-labelledby="recent-heading">
        <div className="row row--between">
          <h2 id="recent-heading">Recent dogs</h2>
          <Link to="/dogdex" className="small">
            Open Dogdex
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="card">
            <p>No dogs yet. Tap “Log a dog” to meet your first one. A breed is all you need.</p>
          </div>
        ) : (
          <div>
            {recent.map((d) => (
              <DogRow key={d.id} dog={d} encounterCount={encounterCounts.get(d.id)} />
            ))}
          </div>
        )}
      </section>

      {nextBadge && (
        <section className="card card--flat" aria-labelledby="next-badge">
          <span className="eyebrow" id="next-badge">Next badge</span>
          <p>
            <strong>{nextBadge.badge.name}</strong>
          </p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={nextBadge.target} aria-valuenow={nextBadge.current} aria-label={`${nextBadge.badge.name} progress`}>
            <span style={{ width: `${(nextBadge.current / nextBadge.target) * 100}%` }} />
          </div>
          <p className="muted small">
            {nextBadge.current} of {nextBadge.target}
          </p>
        </section>
      )}
    </main>
  )
}
