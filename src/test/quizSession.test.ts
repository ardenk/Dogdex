import { beforeEach, describe, expect, it } from 'vitest'
import { clearQuizSession, hasQuizSession, loadQuizSession, saveQuizSession } from '../features/quiz/session'
import type { QuizSessionInput } from '../features/quiz/session'

const base = (over: Partial<QuizSessionInput> = {}): QuizSessionInput => ({
  mode: { kind: 'any' },
  format: 'choices',
  questions: [
    { breedId: 'beagle', options: ['akita', 'beagle', 'boxer', 'pug'], correctIndex: 1 },
    { breedId: 'pug', options: ['pug', 'beagle'], correctIndex: 0 },
  ],
  index: 1,
  imageUrl: 'https://images.dog.ceo/breeds/pug/n1.jpg',
  picked: null,
  answers: [{ breedId: 'beagle', pickedId: 'akita', correct: false }],
  skipped: 0,
  ...over,
})

beforeEach(() => sessionStorage.clear())

describe('quiz round in progress', () => {
  it('is remembered and read back exactly', () => {
    expect(loadQuizSession()).toBeNull()
    expect(hasQuizSession()).toBe(false)
    saveQuizSession(base(), 1000)
    expect(loadQuizSession(1000)).toEqual({ ...base(), savedAt: 1000, finished: false })
    saveQuizSession(base()) // saved just now
    expect(hasQuizSession()).toBe(true)
  })

  it('remembers a category round, an unanswered question, and "I don’t know"', () => {
    saveQuizSession(base({ mode: { kind: 'group', groupId: 'hound' }, format: 'search', picked: '' }), 5)
    expect(loadQuizSession(5)).toMatchObject({ mode: { kind: 'group', groupId: 'hound' }, format: 'search', picked: '' })
  })

  it('can keep a finished round so its results can be shown again, but it no longer counts as a round to resume', () => {
    saveQuizSession(base({ finished: true }))
    expect(loadQuizSession()).toMatchObject({ finished: true })
    expect(hasQuizSession()).toBe(false)
    saveQuizSession(base({ finished: false }))
    expect(hasQuizSession()).toBe(true)
  })

  it('reads a round saved before "finished" existed as unfinished', () => {
    sessionStorage.setItem('dogdex-quiz-in-progress', JSON.stringify({ ...base(), savedAt: Date.now() }))
    expect(loadQuizSession()).toMatchObject({ finished: false })
  })

  it('can be cleared', () => {
    saveQuizSession(base())
    clearQuizSession()
    expect(loadQuizSession()).toBeNull()
  })

  it('is dropped after two hours, so an old round never greets you later', () => {
    saveQuizSession(base(), 0)
    expect(loadQuizSession(2 * 60 * 60 * 1000)).not.toBeNull()
    expect(loadQuizSession(2 * 60 * 60 * 1000 + 1)).toBeNull()
    expect(sessionStorage.length).toBe(0) // and deleted
  })

  it('is ignored, and deleted, when it is damaged or does not make sense', () => {
    for (const bad of [
      'not json',
      '{"hello":1}',
      JSON.stringify({ ...base(), savedAt: Date.now(), index: 9 }), // past the last question
      JSON.stringify({ ...base({ questions: [{ breedId: 'beagle', options: ['akita', 'beagle'], correctIndex: 0 }] }), savedAt: Date.now() }), // the right answer is not where it says
      JSON.stringify({ ...base({ questions: [{ breedId: 'no-such-breed', options: ['no-such-breed'], correctIndex: 0 }], index: 0 }), savedAt: Date.now() }),
      JSON.stringify({ ...base({ imageUrl: 'https://evil.test/a.jpg' }), savedAt: Date.now() }), // only Dog CEO photos
      JSON.stringify({ ...base({ picked: 'no-such-breed' }), savedAt: Date.now() }),
    ]) {
      sessionStorage.setItem('dogdex-quiz-in-progress', bad)
      expect(loadQuizSession(), bad.slice(0, 40)).toBeNull()
      expect(sessionStorage.getItem('dogdex-quiz-in-progress')).toBeNull()
    }
  })

  it('never breaks the quiz when storage is unavailable', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      expect(() => saveQuizSession(base())).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
