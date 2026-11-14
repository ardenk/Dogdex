import type { Guess } from './types'

/** A guess is right when it matches the breed the user finally confirms. null = no guess was made. */
export function isGuessCorrect(guessedBreedId: string | null, confirmedBreedId: string | null): boolean | null {
  if (!guessedBreedId) return null
  return guessedBreedId === confirmedBreedId
}

export interface Accuracy {
  made: number
  correct: number
  /** 0–1, or null when no guesses have been made yet. */
  rate: number | null
  /** Correct/incorrect for the most recent guesses, oldest first. */
  recent: boolean[]
}

export function guessAccuracy(guesses: Guess[], recentCount = 20): Accuracy {
  const made = guesses.filter((g) => g.correct !== null).sort((a, b) => a.createdAt - b.createdAt)
  const correct = made.filter((g) => g.correct).length
  return {
    made: made.length,
    correct,
    rate: made.length ? correct / made.length : null,
    recent: made.slice(-recentCount).map((g) => g.correct === true),
  }
}
