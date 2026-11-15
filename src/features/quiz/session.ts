import { z } from 'zod'
import { breedsById, quizPaths } from '../../data'
import { isDogCeoImageUrl } from '../../services/dogceo'

/**
 * A quiz round in progress, kept in this browser tab's session storage so leaving the quiz (to read about a breed,
 * to log a dog) and coming back puts you on the same question, with the same photo and your answers so far.
 * Session storage is wiped when the tab or app is closed, and a round older than two hours is dropped, so an old
 * round never greets you days later. Nothing here is synced or sent anywhere.
 */
const KEY = 'dogdex-quiz-in-progress'
const MAX_AGE_MS = 2 * 60 * 60 * 1000

const modeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('any') }),
  z.object({ kind: z.literal('common') }),
  z.object({ kind: z.literal('met') }),
  z.object({ kind: z.literal('group'), groupId: z.string() }),
])

const sessionSchema = z.object({
  savedAt: z.number(),
  mode: modeSchema,
  format: z.enum(['choices', 'search']),
  questions: z.array(z.object({ breedId: z.string(), options: z.array(z.string()).min(1), correctIndex: z.number().int().min(0) })).min(1),
  index: z.number().int().min(0),
  /** The photo for the current question, so coming back shows the same one. */
  imageUrl: z.string().nullable(),
  /** The answer given to the current question ('' = "I don't know"), or null if it has not been answered. */
  picked: z.string().nullable(),
  answers: z.array(z.object({ breedId: z.string(), pickedId: z.string(), correct: z.boolean() })),
  skipped: z.number().int().min(0),
  /** True once the round is over and its results are showing. Kept so "Back to results" works from a breed page. */
  finished: z.boolean().default(false),
})

export type QuizSession = z.infer<typeof sessionSchema>
/** What the page keeps; `finished` is optional on the way in. */
export type QuizSessionInput = Omit<z.input<typeof sessionSchema>, 'savedAt'>

export function saveQuizSession(session: QuizSessionInput, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...session, savedAt: now }))
  } catch {
    // Storage can be blocked (private windows); the quiz just won't remember its place.
  }
}

export function clearQuizSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to do
  }
}

/** The saved round, or null if there is none, it is too old, or it does not make sense (then it is deleted). */
export function loadQuizSession(now = Date.now()): QuizSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = sessionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new Error('unreadable')
    const s = parsed.data
    const known = (id: string) => !!breedsById[id]
    const valid =
      now - s.savedAt <= MAX_AGE_MS &&
      s.index < s.questions.length &&
      s.questions.every((q) => known(q.breedId) && !!quizPaths[q.breedId] && q.options.every(known) && q.options[q.correctIndex] === q.breedId) &&
      s.answers.every((a) => known(a.breedId) && (a.pickedId === '' || known(a.pickedId))) &&
      (s.picked === null || s.picked === '' || known(s.picked)) &&
      (s.imageUrl === null || isDogCeoImageUrl(s.imageUrl))
    if (!valid) throw new Error('stale')
    return s
  } catch {
    clearQuizSession()
    return null
  }
}

/** Is there a round still to finish? (A finished round whose results can be shown again does not count.) */
export const hasQuizSession = (): boolean => {
  const s = loadQuizSession()
  return s !== null && !s.finished
}
