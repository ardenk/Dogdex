import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { data, quizPaths } from '../../data'
import { MIN_MET_TO_QUIZ, quizPool } from '../../domain/quiz'
import type { QuizFormat, QuizMode } from '../../domain/quiz'

/** A category needs this many quizzable breeds to offer a round with real choices. */
const MIN_GROUP = 4

interface Props {
  /** How many quizzable breeds you have met. */
  metQuizzable: number
  online: boolean
  onStart: (mode: QuizMode, format: QuizFormat) => void
}

/** One difficulty tile. `level` is 1 (easiest) to 4 (hardest) and drives the little meter. */
function Tile({ title, label, level, disabled, note, expanded, onClick }: { title: string; label: string; level: number; disabled?: boolean; note?: string; expanded?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="quiz-tile" disabled={disabled} aria-expanded={expanded} onClick={onClick}>
      {/* The spaces between the parts keep the button's spoken name readable: "All breeds Medium". */}
      <span className="quiz-tile__name">{title}</span>{' '}
      <span className="quiz-tile__level">
        <span className="quiz-tile__meter" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <i key={n} className={n <= level ? 'on' : ''} />
          ))}
        </span>
        {label}
      </span>
      {note && (
        <>
          {' '}
          <span className="quiz-tile__note">{note}</span>
        </>
      )}
    </button>
  )
}

/** Pick what to be quizzed on. Each tile is a difficulty; tapping one starts the round (the category tile asks which category first). */
export function QuizStart({ metQuizzable, online, onStart }: Props) {
  const pool = useMemo(() => quizPool(data.breeds, quizPaths), [])
  const groups = useMemo(
    () => data.groups.map((g) => ({ group: g, count: pool.filter((b) => b.groupId === g.id).length })).filter((g) => g.count >= MIN_GROUP),
    [pool],
  )
  const [choosingCategory, setChoosingCategory] = useState(false)
  const metLocked = metQuizzable < MIN_MET_TO_QUIZ

  return (
    <div className="stack">
      <Link to="/" className="back-link">← Home</Link>
      <header>
        <h1>What are we testing today?</h1>
      </header>

      <div className="quiz-tiles">
        <Tile
          title="Breeds you’ve met"
          label="Easiest"
          level={1}
          disabled={!online || metLocked}
          note={metLocked ? `Meet ${MIN_MET_TO_QUIZ} breeds that have photos to unlock (you have ${metQuizzable})` : undefined}
          onClick={() => onStart({ kind: 'met' }, 'choices')}
        />
        <Tile title="All breeds" label="Medium" level={2} disabled={!online} onClick={() => onStart({ kind: 'any' }, 'choices')} />
        <Tile title="One breed category" label="Hard" level={3} disabled={!online} expanded={choosingCategory} onClick={() => setChoosingCategory((v) => !v)} />
        <Tile title="All breeds, no suggestions" label="Hardest" level={4} disabled={!online} note="You search for the name" onClick={() => onStart({ kind: 'any' }, 'search')} />
      </div>

      {choosingCategory && (
        <section className="stack" aria-labelledby="quiz-category-heading">
          <h2 id="quiz-category-heading">Which category?</h2>
          <ul className="quiz-categories">
            {groups.map(({ group, count }) => (
              <li key={group.id}>
                <button type="button" className="btn btn--block quiz-category" disabled={!online} onClick={() => onStart({ kind: 'group', groupId: group.id }, 'choices')}>
                  <span>{group.name}</span>{' '}
                  <span className="muted small">{count} breeds</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!online && (
        <p className="card" role="status">
          You’re offline. The quiz loads its photos from the internet, so connect and try again.
        </p>
      )}

      <p className="muted small">
        Photos load from <a href="https://dog.ceo/dog-api/" target="_blank" rel="noreferrer">Dog CEO</a> (from the Stanford Dogs Dataset). Opening one tells that site
        your IP address, as any website does; nothing about you or your dogs is sent. Unfinished rounds aren’t counted.
      </p>
    </div>
  )
}
