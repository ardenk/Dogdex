import { Link } from 'react-router'
import { breedsById } from '../../data'
import { scoreMessage } from '../../domain/quiz'

export interface Answer {
  breedId: string
  pickedId: string
  correct: boolean
}

interface Props {
  answers: Answer[]
  /** Questions dropped because their photo would not load. */
  skipped: number
  modeLabel: string
  onAgain: () => void
  onChangeMode: () => void
}

/** The end of a round: the score, a kind note, and the breeds that were missed. */
export function QuizResults({ answers, skipped, modeLabel, onAgain, onChangeMode }: Props) {
  const correct = answers.filter((a) => a.correct).length
  const missed = answers.filter((a) => !a.correct)

  return (
    <div className="stack">
      <header>
        <span className="eyebrow">{modeLabel}</span>
        <h1>
          {correct} of {answers.length}
        </h1>
        <p className="muted">{scoreMessage(correct, answers.length)}</p>
        {skipped > 0 && <p className="muted small">{skipped === 1 ? '1 question was skipped' : `${skipped} questions were skipped`} because a photo would not load.</p>}
      </header>

      {missed.length > 0 && (
        <section className="stack" aria-labelledby="missed-heading">
          <h2 id="missed-heading">Worth another look</h2>
          <ul className="stack">
            {missed.map((a) => (
              <li key={a.breedId} className="card quiz-missed">
                <Link to={`/dogdex/breed/${a.breedId}`}>
                  <strong>{breedsById[a.breedId].name}</strong>
                </Link>
                <span className="muted small"> {a.pickedId ? `You said ${breedsById[a.pickedId].name}` : 'You skipped this one'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="btn btn--primary btn--block" onClick={onAgain}>
        Play again
      </button>
      <button type="button" className="btn btn--block" onClick={onChangeMode}>
        Change what I’m quizzed on
      </button>
      <Link to="/" className="back-link">
        ← Home
      </Link>
    </div>
  )
}
