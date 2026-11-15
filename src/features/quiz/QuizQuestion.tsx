import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { RarityMark } from '../../components/RarityMark'
import { breedsById, entryNumber, groupsById } from '../../data'
import { entryLabel } from '../../domain/format'
import type { QuizFormat, QuizQuestion as Question } from '../../domain/quiz'
import { BreedSearchAnswer } from './BreedSearchAnswer'

interface Props {
  index: number
  total: number
  /** The photo, or null while it loads. */
  imageUrl: string | null
  question: Question
  /** Four names to pick from, or (the hardest round) a search box with no hints. */
  format: QuizFormat
  /** The breed the player chose once they have answered; '' means they gave up on this one. */
  picked: string | null
  /** Has the player met this breed (for the "log one" link)? */
  met: boolean
  isLast: boolean
  /** The breed chosen, or '' for "I don't know". */
  onPick: (breedId: string) => void
  onNext: () => void
  onClose: () => void
}

/** One question: the photo, four breed names, and (after answering) what the right answer was. */
export function QuizQuestion({ index, total, imageUrl, question, format, picked, met, isLast, onPick, onNext, onClose }: Props) {
  const answered = picked !== null
  const right = breedsById[question.breedId]
  const wasRight = picked === question.breedId
  const feedback = useRef<HTMLDivElement>(null)
  // After answering, move to the result so a screen reader hears it and the next button is one Tab away.
  useEffect(() => {
    if (answered) feedback.current?.focus()
  }, [answered])

  return (
    <div className="stack">
      <div className="row row--between">
        <span className="eyebrow" aria-live="polite">
          Question {index + 1} of {total}
        </span>
        <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
          End quiz
        </button>
      </div>
      <div className="progress" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + (answered ? 1 : 0)}>
        <span style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }} />
      </div>

      <div className="quiz-photo">
        {imageUrl ? (
          // The description must not give the answer away.
          <img src={imageUrl} alt="A dog to identify" />
        ) : (
          <p className="muted" role="status">
            Loading photo…
          </p>
        )}
      </div>

      {format === 'search' && imageUrl && !answered && <BreedSearchAnswer onSubmit={(id) => onPick(id ?? '')} />}

      {format === 'choices' && (
      <div role="group" aria-label="Which breed is this?" className="quiz-options">
        {question.options.map((id) => {
          const isRight = id === question.breedId
          const isPicked = id === picked
          const state = !answered ? '' : isRight ? 'quiz-option--right' : isPicked ? 'quiz-option--wrong' : 'quiz-option--dim'
          return (
            <button key={id} type="button" className={`quiz-option ${state}`} disabled={answered || !imageUrl} onClick={() => onPick(id)} aria-pressed={isPicked}>
              <span>{breedsById[id].name}</span>
              {answered && isRight && <span aria-hidden="true">✓</span>}
              {answered && isPicked && !isRight && <span aria-hidden="true">✗</span>}
            </button>
          )
        })}
      </div>
      )}

      {answered && (
        <div ref={feedback} tabIndex={-1} className={`card stack quiz-feedback ${wasRight ? 'quiz-feedback--right' : 'quiz-feedback--wrong'}`} role="status">
          <h2>{wasRight ? '✓ Correct' : picked ? `✗ Not quite. It’s ${right.name}` : `It’s ${right.name}`}</h2>
          {format === 'search' && picked && !wasRight && <p>You said {breedsById[picked].name}.</p>}
          <div className="row">
            <span className="mono small">
              {entryLabel(entryNumber[right.id])} · {groupsById[right.groupId].name}
            </span>
            <RarityMark rarity={right.rarity} />
          </div>
          <div className="row">
            <Link to={`/dogdex/breed/${right.id}`} className="small">
              See {right.name} in the Dogdex
            </Link>
            {!met && (
              <Link to={`/log?breed=${right.id}`} className="small">
                Spot one? Log it
              </Link>
            )}
          </div>
          <button type="button" className="btn btn--primary btn--block" onClick={onNext}>
            {isLast ? 'See results' : 'Next question'}
          </button>
        </div>
      )}

    </div>
  )
}
