import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { QuizStart } from './QuizStart'

type Phase = 'start' | 'loading' | 'question' | 'answered' | 'results' | 'error'

const modeLabel = (mode: QuizMode, format: QuizFormat) =>
  `${mode.kind === 'group' ? `${groupsById[mode.groupId]?.name ?? 'Category'} quiz` : mode.kind === 'met' ? 'Breeds you’ve met' : 'Any breed'}${format === 'search' ? ' · hardest' : ''}`

/** The breed quiz: pick a mode, answer ten "name this breed" photo questions, see the score. */
export function QuizPage() {
  const { snapshot } = useData()
  const navigate = useNavigate()
  const pool = useMemo(() => quizPool(data.breeds, quizPaths), [])
  const metIds = useMemo(() => new Set(snapshot.dogs.filter((d) => !d.deletedAt && d.breedId).map((d) => d.breedId as string)), [snapshot.dogs])
  const metQuizzable = useMemo(() => pool.filter((b) => metIds.has(b.id)).length, [pool, metIds])

  const [phase, setPhase] = useState<Phase>('start')
  const [mode, setMode] = useState<QuizMode>({ kind: 'any' })
  const [format, setFormat] = useState<QuizFormat>('choices')
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [skipped, setSkipped] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<BadgeDef[] | null>(null)

  // Photos are requested one question ahead; a map of promises lets the next question appear without a wait.
  const photos = useRef(new Map<number, Promise<string>>())
  const ctl = useRef(new AbortController())
  const saved = useRef(false)
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

  const start = (next: QuizMode, nextFormat: QuizFormat) => {
    const round = buildRound({ pool, mode: next, metBreedIds: metIds, photoCounts: quizPhotos, choices: choicesFor(nextFormat) })
    if (round.length === 0) {
      setMessage('There are not enough breeds with photos for that. Pick another mode.')
      setPhase('error')
      return
    }
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

  const close = () => navigate('/')
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
          <button type="button" className="btn btn--ghost btn--block" onClick={close}>
            Leave the quiz
          </button>
        </div>
      )}

      {celebration && (
        <Celebration title="New badge!" glyph={celebration[0].glyph} badges={celebration} viewHref="/badges" onClose={() => setCelebration(null)} />
      )}
    </main>
  )
}
