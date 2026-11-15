import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Celebration } from '../../components/Celebration'
import { data, groupsById, quizPaths, quizPhotos } from '../../data'
import type { BadgeDef } from '../../data'
import { applyRound, buildRound, choicesFor, quizPool } from '../../domain/quiz'
import type { QuizFormat, QuizMode, QuizQuestion as Question } from '../../domain/quiz'
import { preloadImage, QuizImageError, randomImageUrl } from '../../services/dogceo'
import { awardNewBadges } from '../../storage/awardBadges'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'
import { QuizQuestion } from './QuizQuestion'
import { QuizResults } from './QuizResults'
import type { Answer } from './QuizResults'
import { clearQuizSession, loadQuizSession, saveQuizSession } from './session'
import { QuizStart } from './QuizStart'

type Phase = 'start' | 'loading' | 'question' | 'answered' | 'results' | 'error'

const modeLabel = (mode: QuizMode, format: QuizFormat) =>
  `${mode.kind === 'group' ? `${groupsById[mode.groupId]?.name ?? 'Category'} quiz` : mode.kind === 'met' ? 'Breeds you’ve met' : mode.kind === 'common' ? 'Common breeds' : 'Any breed'}${format === 'search' ? ' · hardest' : ''}`

/** The breed quiz: pick a mode, answer ten "name this breed" photo questions, see the score. */
export function QuizPage() {
  const { snapshot } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  // "Back to results" from a breed page arrives with this flag in the history entry (also used by the browser's Back button).
  const wantsResults = (location.state as { quizResults?: boolean } | null)?.quizResults === true
  const pool = useMemo(() => quizPool(data.breeds, quizPaths), [])
  const metIds = useMemo(() => new Set(snapshot.dogs.filter((d) => !d.deletedAt && d.breedId).map((d) => d.breedId as string)), [snapshot.dogs])
  const metQuizzable = useMemo(() => pool.filter((b) => metIds.has(b.id)).length, [pool, metIds])

  // A round left in progress (you went to read about a breed, say) comes back exactly where it was.
  const [resumed] = useState(() => {
    const kept = loadQuizSession()
    // A finished round only comes back when you are returning to its results, not when you start the quiz afresh.
    if (kept?.finished && !wantsResults) {
      clearQuizSession()
      return null
    }
    return kept
  })
  const [phase, setPhase] = useState<Phase>(resumed ? (resumed.finished ? 'results' : resumed.picked !== null ? 'answered' : resumed.imageUrl ? 'question' : 'loading') : 'start')
  const [mode, setMode] = useState<QuizMode>(resumed?.mode ?? { kind: 'any' })
  const [format, setFormat] = useState<QuizFormat>(resumed?.format ?? 'choices')
  const [questions, setQuestions] = useState<Question[]>(resumed?.questions ?? [])
  const [index, setIndex] = useState(resumed?.index ?? 0)
  const [imageUrl, setImageUrl] = useState<string | null>(resumed?.imageUrl ?? null)
  const [picked, setPicked] = useState<string | null>(resumed?.picked ?? null)
  const [answers, setAnswers] = useState<Answer[]>(resumed?.answers ?? [])
  const [skipped, setSkipped] = useState(resumed?.skipped ?? 0)
  const [message, setMessage] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<BadgeDef[] | null>(null)

  // Photos are requested one question ahead; a map of promises lets the next question appear without a wait.
  const photos = useRef(new Map<number, Promise<string>>())
  const ctl = useRef(new AbortController())
  // Totals are added once per round: a round restored at its results has already been counted.
  const saved = useRef(resumed?.finished === true)
  useEffect(() => {
    const c = ctl.current
    return () => c.abort()
  }, [])

  const fetchPhoto = useCallback(
    (i: number, round: Question[]): Promise<string> => {
      const hit = photos.current.get(i)
      if (hit) return hit
      const path = quizPaths[round[i].breedId]
      const attempt = async () => {
        const url = await randomImageUrl(path, { signal: ctl.current.signal })
        await preloadImage(url)
        return url
      }
      // One retry: a single dead image should not cost the player a question.
      const p = attempt()
        .catch((e) => (ctl.current.signal.aborted ? Promise.reject(e) : attempt()))
        .catch((e) => {
          photos.current.delete(i)
          throw e
        })
      photos.current.set(i, p)
      return p
    },
    [],
  )

  const finish = useCallback(() => setPhase('results'), [])

  // Load the photo for the current question, then warm up the next one.
  useEffect(() => {
    if (phase !== 'loading') return
    let live = true
    fetchPhoto(index, questions)
      .then((url) => {
        if (!live) return
        setImageUrl(url)
        setPhase('question')
        if (index + 1 < questions.length) fetchPhoto(index + 1, questions).catch(() => undefined)
      })
      .catch((e: unknown) => {
        if (!live || ctl.current.signal.aborted) return
        if (e instanceof QuizImageError && e.kind === 'network') {
          setMessage(e.message)
          setPhase('error')
          return
        }
        // This breed's photos are not working right now: skip the question.
        setSkipped((s) => s + 1)
        if (index + 1 < questions.length) setIndex(index + 1)
        else finish()
      })
    return () => {
      live = false
    }
  }, [phase, index, questions, fetchPhoto, finish])

  // When a round ends, add it to the lifetime totals exactly once and award any badge it earned.
  useEffect(() => {
    if (phase !== 'results' || saved.current || answers.length === 0) return
    saved.current = true
    void (async () => {
      const current = (await repo.getSettings()).quizStats
      await repo.setSetting('quizStats', applyRound(current, { answered: answers.length, correct: answers.filter((a) => a.correct).length }))
      const fresh = await awardNewBadges(repo)
      if (fresh.length) setCelebration(fresh)
    })()
  }, [phase, answers])

  // Remember the round while it is under way (and its results once it is over); forget it when you are back at the start.
  useEffect(() => {
    if (phase === 'start') clearQuizSession()
    else if (questions.length > 0) saveQuizSession({ mode, format, questions, index, imageUrl, picked, answers, skipped, finished: phase === 'results' })
  }, [phase, mode, format, questions, index, imageUrl, picked, answers, skipped])

  // Mark the results in the browser's history, so Back from a breed page lands on them rather than on the start screen.
  useEffect(() => {
    if (phase === 'results' && !wantsResults) navigate(`${location.pathname}${location.search}`, { replace: true, state: { quizResults: true } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const start = (next: QuizMode, nextFormat: QuizFormat) => {
    const round = buildRound({ pool, mode: next, metBreedIds: metIds, photoCounts: quizPhotos, choices: choicesFor(nextFormat) })
    if (round.length === 0) {
      setMessage('There are not enough breeds with photos for that. Pick another mode.')
      setPhase('error')
      return
    }
    if (wantsResults) navigate(`${location.pathname}${location.search}`, { replace: true, state: null }) // a new round, so no longer "the results"
    photos.current.clear()
    saved.current = false
    setMode(next)
    setFormat(nextFormat)
    setQuestions(round)
    setIndex(0)
    setAnswers([])
    setSkipped(0)
    setPicked(null)
    setImageUrl(null)
    setMessage(null)
    setPhase('loading')
  }

  const choose = (breedId: string) => {
    if (phase !== 'question') return
    setPicked(breedId)
    setAnswers((a) => [...a, { breedId: questions[index].breedId, pickedId: breedId, correct: breedId === questions[index].breedId }])
    setPhase('answered')
  }

  const next = () => {
    if (index + 1 >= questions.length) return finish()
    setIndex(index + 1)
    setPicked(null)
    setImageUrl(null)
    setPhase('loading')
  }

  const close = () => {
    clearQuizSession() // ending the quiz means ending it: the round is not kept
    navigate('/')
  }
  const current = questions[index]

  return (
    <main className="page">
      {phase === 'start' && <QuizStart metQuizzable={metQuizzable} online={typeof navigator === 'undefined' || navigator.onLine} onStart={start} />}

      {(phase === 'loading' || phase === 'question' || phase === 'answered') && current && (
        <QuizQuestion
          index={index}
          total={questions.length}
          imageUrl={phase === 'loading' ? null : imageUrl}
          question={current}
          format={format}
          picked={phase === 'answered' ? picked : null}
          met={metIds.has(current.breedId)}
          isLast={index + 1 >= questions.length}
          onPick={choose}
          onNext={next}
          onClose={close}
        />
      )}

      {phase === 'results' && <QuizResults answers={answers} skipped={skipped} modeLabel={modeLabel(mode, format)} onAgain={() => start(mode, format)} onChangeMode={() => setPhase('start')} />}

      {phase === 'error' && (
        <div className="stack">
          <Link to="/" className="back-link">← Home</Link>
          <h1>Quiz paused</h1>
          <p role="alert">{message ?? 'Something went wrong.'}</p>
          {questions.length > 0 && answers.length < questions.length && (
            <button type="button" className="btn btn--primary btn--block" onClick={() => setPhase('loading')}>
              Try again
            </button>
          )}
          <button type="button" className="btn btn--block" onClick={() => setPhase('start')}>
            Back to the start
          </button>
        </div>
      )}

      {celebration && (
        <Celebration title="New badge!" glyph={celebration[0].glyph} badges={celebration} viewHref="/badges" onClose={() => setCelebration(null)} />
      )}
    </main>
  )
}
