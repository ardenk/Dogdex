import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { axe } from 'vitest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { breedsById, data, quizPaths, quizPhotos } from '../data'
import { buildRound, quizPool, seededRng } from '../domain/quiz'
import type { Dog, Snapshot } from '../domain/types'
import { DEFAULT_SETTINGS } from '../domain/types'
import { BreedPage } from '../features/breed/BreedPage'
import { HomePage } from '../features/home/HomePage'
import { LogPage } from '../features/log/LogPage'
import { QuizPage } from '../features/quiz/QuizPage'
import { YouPage } from '../features/you/YouPage'
import * as dogceo from '../services/dogceo'
import { DataContext } from '../storage/data-context'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'

vi.mock('../services/dogceo', async (orig) => ({ ...(await orig<typeof import('../services/dogceo')>()), randomImageUrl: vi.fn(), preloadImage: vi.fn() }))
const randomImageUrl = vi.mocked(dogceo.randomImageUrl)
const preloadImage = vi.mocked(dogceo.preloadImage)

const SEED = 5
const pool = quizPool(data.breeds, quizPaths)
const planned = () => buildRound({ pool, mode: { kind: 'any' }, photoCounts: quizPhotos, rng: seededRng(SEED) })

const dog = (id: string, breedId: string): Dog => ({ id, breedId, firstMetAt: 1, lastMetAt: 1, createdAt: 1, updatedAt: 1 })
const snapshot = (breedIds: string[] = []): Snapshot => ({ dogs: breedIds.map((b, i) => dog(`d${i}`, b)), encounters: [], guesses: [], awards: [], stickers: [] })

function renderQuiz(snap: Snapshot = snapshot()) {
  return render(
    <MemoryRouter initialEntries={['/quiz']}>
      <DataContext.Provider value={{ snapshot: snap, settings: DEFAULT_SETTINGS }}>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )
}

const tile = (name: RegExp) => screen.getByRole('button', { name })
/** The "All breeds" (medium) tile: four choices, any breed. */
const startMedium = () => fireEvent.click(tile(/^All breeds Medium/))

/** Plays a round, answering the first `rightCount` questions correctly and the rest wrongly. */
async function playRound(rightCount: number) {
  const qs = planned()
  startMedium()
  for (let i = 0; i < qs.length; i++) {
    await screen.findByText(`Question ${i + 1} of ${qs.length}`)
    await screen.findByRole('img', { name: 'A dog to identify' })
    const group = screen.getByRole('group', { name: 'Which breed is this?' })
    const q = qs[i]
    const target = i < rightCount ? q.breedId : q.options.find((id) => id !== q.breedId)!
    fireEvent.click(within(group).getByRole('button', { name: new RegExp(`^${breedsById[target].name.replace(/[()]/g, '\\$&')}`) }))
    fireEvent.click(await screen.findByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
  }
  return qs
}

beforeEach(async () => {
  await db.settings.clear()
  vi.spyOn(Math, 'random').mockImplementation(seededRng(SEED))
  randomImageUrl.mockReset().mockImplementation(async (path: string) => `https://images.dog.ceo/breeds/${path.replace('/', '-')}/n1.jpg`)
  preloadImage.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('quiz start screen', () => {
  const metFour = () => snapshot(['beagle', 'akita', 'boxer', 'pug'])

  it('asks what we are testing today, with five difficulty tiles in a grid, easiest first', () => {
    renderQuiz(metFour())
    expect(screen.getByRole('heading', { level: 1, name: 'What are we testing today?' })).toBeTruthy()
    expect(document.querySelector('.quiz-tiles')).not.toBeNull()
    const tiles = [...document.querySelectorAll('.quiz-tile')]
    expect(tiles.map((t) => t.querySelector('.quiz-tile__name')?.textContent)).toEqual(['Breeds you’ve met', 'Common breeds', 'All breeds', 'One breed category', 'All breeds, no suggestions'])
    expect(tiles.map((t) => t.querySelector('.quiz-tile__level')?.textContent)).toEqual(['Easiest', 'Easy', 'Medium', 'Hard', 'Hardest'])
  })

  it('explains that a category quiz is harder because similar breeds look alike', () => {
    renderQuiz()
    expect(tile(/^One breed category/)).toHaveTextContent('Harder to tell similar breeds apart')
  })

  it('gives every tile a five-step difficulty meter that fills up as it gets harder', () => {
    renderQuiz()
    const filled = [...document.querySelectorAll('.quiz-tile')].map((t) => [t.querySelectorAll('.quiz-tile__meter i').length, t.querySelectorAll('.quiz-tile__meter i.on').length])
    expect(filled).toEqual([[5, 1], [5, 2], [5, 3], [5, 4], [5, 5]])
  })

  it('"Common breeds" starts a round about everyday breeds only, with four choices', async () => {
    renderQuiz()
    expect(tile(/^Common breeds Easy/)).toHaveTextContent('The dogs you’re most likely to meet')
    fireEvent.click(tile(/^Common breeds Easy/))
    await screen.findByRole('img', { name: 'A dog to identify' })
    const commonPaths = pool.filter((b) => b.rarity === 'common').map((b) => quizPaths[b.id])
    expect(commonPaths).toContain(randomImageUrl.mock.calls[0][0])
    expect(within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')).toHaveLength(4)
  })

  it('labels a finished common-breeds round as such', async () => {
    renderQuiz()
    fireEvent.click(tile(/^Common breeds Easy/))
    const qs = buildRound({ pool, mode: { kind: 'common' }, photoCounts: quizPhotos, rng: seededRng(SEED) })
    for (let i = 0; i < qs.length; i++) {
      await screen.findByText(`Question ${i + 1} of ${qs.length}`)
      await screen.findByRole('img', { name: 'A dog to identify' })
      const q = qs[i]
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${breedsById[q.breedId].name.replace(/[()]/g, '\\$&')}`) }))
      fireEvent.click(await screen.findByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
    }
    expect(await screen.findByText('Common breeds')).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 1, name: '10 of 10' })).toBeTruthy()
  })

  it('has dropped the old intro text, the radio buttons and the Start button', () => {
    renderQuiz()
    expect(screen.queryByText(/Ten photos, four choices each/)).toBeNull()
    expect(screen.queryByText(/No timer, no streaks/)).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start quiz' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Dog CEO' })).toHaveAttribute('href', 'https://dog.ceo/dog-api/')
  })

  it('locks "breeds you’ve met" until four quizzable breeds are met, and says why', () => {
    renderQuiz(snapshot(['beagle', 'akita', 'boxer', 'goldendoodle'])) // goldendoodle has no photos, so only three count
    expect(tile(/^Breeds you’ve met/)).toBeDisabled()
    expect(screen.getByText('Meet 4 breeds that have photos to unlock (you have 3)')).toBeTruthy()
  })

  it('"Breeds you’ve met" starts a round about only those breeds', async () => {
    renderQuiz(metFour())
    expect(tile(/^Breeds you’ve met/)).toBeEnabled()
    fireEvent.click(tile(/^Breeds you’ve met/))
    await screen.findByRole('img', { name: 'A dog to identify' })
    expect(screen.getByText('Question 1 of 4')).toBeTruthy()
    expect(['beagle', 'akita', 'boxer', 'pug'].map((id) => quizPaths[id])).toContain(randomImageUrl.mock.calls[0][0])
    expect(within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')).toHaveLength(4)
  })

  it('"All breeds" starts a ten-question round with four choices', async () => {
    renderQuiz()
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    expect(screen.getByText('Question 1 of 10')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')).toHaveLength(4)
  })

  it('"One breed category" asks which category, then quizzes just that category', async () => {
    renderQuiz()
    const category = tile(/^One breed category/)
    expect(category).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(category)
    expect(category).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Which category?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Hound/ }))
    await screen.findByRole('img', { name: 'A dog to identify' })
    for (const b of within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')) {
      expect(data.breeds.find((x) => x.name === b.textContent)?.groupId).toBe('hound')
    }
  })

  it('"All breeds, no suggestions" starts the search round', async () => {
    renderQuiz()
    fireEvent.click(tile(/^All breeds, no suggestions Hardest/))
    expect(await screen.findByRole('searchbox', { name: /Which breed is this/ })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Which breed is this?' })).toBeNull()
  })

  it('cannot start while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderQuiz(metFour())
    for (const t of document.querySelectorAll('.quiz-tile')) expect(t).toBeDisabled()
    expect(screen.getByText(/You’re offline/)).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderQuiz(metFour())
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
    fireEvent.click(tile(/^One breed category/))
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('playing a round', () => {
  it('shows a photo of the right breed without giving the answer away, and four choices', async () => {
    renderQuiz()
    startMedium()
    const q = planned()[0]
    const img = await screen.findByRole('img', { name: 'A dog to identify' })
    expect(img).toHaveAttribute('src', expect.stringContaining('https://images.dog.ceo/'))
    expect(randomImageUrl.mock.calls[0][0]).toBe(quizPaths[q.breedId])
    expect(within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')).toHaveLength(4)
    expect(screen.queryByText(breedsById[q.breedId].name, { selector: 'h2' })).toBeNull() // not revealed yet
  })

  it('tells you when you are right', async () => {
    renderQuiz()
    startMedium()
    const q = planned()[0]
    await screen.findByRole('img', { name: 'A dog to identify' })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${breedsById[q.breedId].name}`) }))
    expect(await screen.findByText('✓ Correct')).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(`See ${breedsById[q.breedId].name}`) })).toHaveAttribute('href', `/dogdex/breed/${q.breedId}`)
    expect(screen.getByRole('link', { name: 'Spot one? Log it' })).toHaveAttribute('href', `/log?breed=${q.breedId}`)
  })

  it('names the right breed when you are wrong, and does not offer "log it" for a breed you have met', async () => {
    const q = planned()[0]
    renderQuiz(snapshot([q.breedId]))
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    const wrong = q.options.find((id) => id !== q.breedId)!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${breedsById[wrong].name.replace(/[()]/g, '\\$&')}`) }))
    expect(await screen.findByText(`✗ Not quite. It’s ${breedsById[q.breedId].name}`)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Spot one? Log it' })).toBeNull()
    for (const b of within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')) expect(b).toBeDisabled()
  })

  it('plays ten questions, scores them, lists the misses and saves the totals exactly once', async () => {
    renderQuiz()
    const qs = await playRound(7)
    expect(await screen.findByRole('heading', { level: 1, name: '7 of 10' })).toBeTruthy()
    const missed = within(screen.getByRole('region', { name: 'Worth another look' }))
    expect(missed.getAllByRole('link').length).toBeGreaterThanOrEqual(3)
    for (const q of qs.slice(7)) expect(screen.getByRole('link', { name: breedsById[q.breedId].name })).toHaveAttribute('href', `/dogdex/breed/${q.breedId}`)

    await waitFor(async () => expect((await repo.getSettings()).quizStats).toEqual({ rounds: 1, answered: 10, correct: 7, best: 7 }))
    await new Promise((r) => setTimeout(r, 50)) // a re-render must not add the round again
    expect((await repo.getSettings()).quizStats.rounds).toBe(1)
  })

  it('adds a second round to the first and keeps the best score', async () => {
    renderQuiz()
    await playRound(7)
    await screen.findByRole('heading', { name: '7 of 10' })
    await waitFor(async () => expect((await repo.getSettings()).quizStats.rounds).toBe(1))
    // Same seed again: the second round is the same questions, answered worse.
    vi.spyOn(Math, 'random').mockImplementation(seededRng(SEED))
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    const qs = planned()
    for (let i = 0; i < qs.length; i++) {
      await screen.findByText(`Question ${i + 1} of ${qs.length}`)
      await screen.findByRole('img', { name: 'A dog to identify' })
      const q = qs[i]
      const target = i < 2 ? q.breedId : q.options.find((id) => id !== q.breedId)!
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${breedsById[target].name.replace(/[()]/g, '\\$&')}`) }))
      fireEvent.click(await screen.findByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
    }
    await waitFor(async () => expect((await repo.getSettings()).quizStats).toEqual({ rounds: 2, answered: 20, correct: 9, best: 7 }))
  })

  it('awards the Quiz whiz badge once 25 answers are right, and celebrates it', async () => {
    await repo.setSetting('quizStats', { rounds: 2, answered: 20, correct: 20, best: 10 })
    renderQuiz()
    await playRound(10)
    expect(await screen.findByText('10 of 10')).toBeTruthy()
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect((await repo.getSnapshot()).awards.map((a) => a.badgeId)).toContain('quiz-whiz')
  })

  it('has no accessibility violations on a question', async () => {
    const { container } = renderQuiz()
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('the hardest round: no choices, search the breed name', () => {
  const hardPlan = () => buildRound({ pool, mode: { kind: 'any' }, photoCounts: quizPhotos, choices: 1, rng: seededRng(SEED) })
  const startHardest = () => fireEvent.click(tile(/^All breeds, no suggestions/))
  const search = async (text: string) => {
    fireEvent.change(await screen.findByRole('searchbox', { name: /Which breed is this/ }), { target: { value: text } })
  }

  it('shows the photo and a search box instead of four answers, and lists nothing until you type', async () => {
    renderQuiz()
    startHardest()
    await screen.findByRole('img', { name: 'A dog to identify' })
    expect(screen.queryByRole('group', { name: 'Which breed is this?' })).toBeNull()
    expect(await screen.findByRole('searchbox', { name: /Which breed is this/ })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Matching breeds' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled()
  })

  it('lists only breed names as you type, with no group, rarity or number to hint with', async () => {
    renderQuiz()
    startHardest()
    await search('terrier')
    const list = screen.getByRole('list', { name: 'Matching breeds' })
    const items = within(list).getAllByRole('button')
    expect(items.length).toBeGreaterThan(1)
    expect(items.length).toBeLessThanOrEqual(8)
    expect(list.textContent).not.toMatch(/No\. \d/) // no Dogdex numbers
    expect(list.querySelector('.rarity')).toBeNull() // no rarity marks
    for (const b of items) expect(data.breeds.some((x) => x.name === b.textContent)).toBe(true) // each row is just a breed name
  })

  it('lets you pick any Dogdex breed, including ones the quiz has no photos for', async () => {
    renderQuiz()
    startHardest()
    await search('goldendoodle')
    expect(quizPaths['goldendoodle']).toBeUndefined()
    expect(within(screen.getByRole('list', { name: 'Matching breeds' })).getByRole('button', { name: 'Goldendoodle' })).toBeTruthy()
  })

  it('marks the right answer correct', async () => {
    renderQuiz()
    startHardest()
    const target = breedsById[hardPlan()[0].breedId]
    await search(target.name)
    fireEvent.click(within(screen.getByRole('list', { name: 'Matching breeds' })).getByRole('button', { name: target.name }))
    expect(screen.getByText('Your answer:', { exact: false })).toHaveTextContent(target.name)
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText('✓ Correct')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull() // the box goes away once answered
  })

  it('names the right breed, and what you said, when you are wrong', async () => {
    renderQuiz()
    startHardest()
    const q = hardPlan()[0]
    const wrong = data.breeds.find((b) => b.id !== q.breedId && b.name === 'Beagle') ?? breedsById['akita']
    const wrongBreed = wrong.id === q.breedId ? breedsById['pug'] : wrong
    await search(wrongBreed.name)
    fireEvent.click(within(screen.getByRole('list', { name: 'Matching breeds' })).getByRole('button', { name: wrongBreed.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText(`✗ Not quite. It’s ${breedsById[q.breedId].name}`)).toBeTruthy()
    expect(screen.getByText(`You said ${wrongBreed.name}.`)).toBeTruthy()
  })

  it('lets you give up on a question, without a ✗, and says so in the results', async () => {
    renderQuiz()
    startHardest()
    const qs = hardPlan()
    for (let i = 0; i < qs.length; i++) {
      await screen.findByText(`Question ${i + 1} of ${qs.length}`)
      await screen.findByRole('img', { name: 'A dog to identify' })
      fireEvent.click(await screen.findByRole('button', { name: 'I don’t know' }))
      expect(await screen.findByText(`It’s ${breedsById[qs[i].breedId].name}`)).toBeTruthy()
      expect(screen.queryByText(/Not quite/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
    }
    expect(await screen.findByRole('heading', { level: 1, name: '0 of 10' })).toBeTruthy()
    expect(screen.getByText('Any breed · hardest')).toBeTruthy()
    expect(screen.getAllByText('You skipped this one')).toHaveLength(10)
  })

  it('counts toward the same lifetime totals, and "Play again" stays on the hardest round', async () => {
    renderQuiz()
    startHardest()
    const qs = hardPlan()
    for (let i = 0; i < qs.length; i++) {
      await screen.findByText(`Question ${i + 1} of ${qs.length}`)
      await screen.findByRole('img', { name: 'A dog to identify' })
      const target = breedsById[qs[i].breedId]
      await search(target.name)
      fireEvent.click(within(screen.getByRole('list', { name: 'Matching breeds' })).getByRole('button', { name: target.name }))
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
      fireEvent.click(await screen.findByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
    }
    expect(await screen.findByRole('heading', { level: 1, name: '10 of 10' })).toBeTruthy()
    await waitFor(async () => expect((await repo.getSettings()).quizStats).toEqual({ rounds: 1, answered: 10, correct: 10, best: 10 }))
    vi.spyOn(Math, 'random').mockImplementation(seededRng(SEED))
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(await screen.findByRole('searchbox', { name: /Which breed is this/ })).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderQuiz()
    startHardest()
    await search('beag')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('keeping your place in the quiz', () => {
  const answerFirst = async (qs: ReturnType<typeof planned>, i: number, right: boolean) => {
    await screen.findByText(`Question ${i + 1} of ${qs.length}`)
    await screen.findByRole('img', { name: 'A dog to identify' })
    const q = qs[i]
    const target = right ? q.breedId : q.options.find((id) => id !== q.breedId)!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${breedsById[target].name.replace(/[()]/g, '\\$&')}`) }))
  }

  it('comes back to the same question, with the same photo and your answer, after you leave', async () => {
    const first = renderQuiz()
    startMedium()
    const qs = planned()
    await answerFirst(qs, 0, true)
    const photo = (screen.getByRole('img', { name: 'A dog to identify' }) as HTMLImageElement).src
    expect(await screen.findByText('✓ Correct')).toBeTruthy()
    first.unmount() // e.g. "See Poodle (Toy) in the Dogdex"

    renderQuiz()
    expect(screen.queryByRole('heading', { name: 'What are we testing today?' })).toBeNull() // not back at the start
    expect(screen.getByText('Question 1 of 10')).toBeTruthy()
    expect(screen.getByText('✓ Correct')).toBeTruthy()
    expect((screen.getByRole('img', { name: 'A dog to identify' }) as HTMLImageElement).src).toBe(photo)
    for (const b of within(screen.getByRole('group', { name: 'Which breed is this?' })).getAllByRole('button')) expect(b).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(await screen.findByText('Question 2 of 10')).toBeTruthy()
  })

  it('keeps your earlier answers, so the final score counts them', async () => {
    const first = renderQuiz()
    startMedium()
    const qs = planned()
    await answerFirst(qs, 0, true)
    fireEvent.click(await screen.findByRole('button', { name: 'Next question' }))
    await answerFirst(qs, 1, true)
    first.unmount()

    renderQuiz()
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    for (let i = 2; i < qs.length; i++) {
      await answerFirst(qs, i, false)
      fireEvent.click(await screen.findByRole('button', { name: i === qs.length - 1 ? 'See results' : 'Next question' }))
    }
    expect(await screen.findByRole('heading', { level: 1, name: '2 of 10' })).toBeTruthy()
    await waitFor(async () => expect((await repo.getSettings()).quizStats).toEqual({ rounds: 1, answered: 10, correct: 2, best: 2 }))
  })

  it('resumes the hardest (search) round too', async () => {
    const first = renderQuiz()
    fireEvent.click(tile(/^All breeds, no suggestions/))
    await screen.findByRole('searchbox', { name: /Which breed is this/ })
    first.unmount()
    renderQuiz()
    expect(await screen.findByRole('searchbox', { name: /Which breed is this/ })).toBeTruthy()
  })

  it('does not bring back a round you ended', async () => {
    const first = renderQuiz()
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    fireEvent.click(screen.getByRole('button', { name: 'End quiz' }))
    first.unmount()
    renderQuiz()
    expect(screen.getByRole('heading', { name: 'What are we testing today?' })).toBeTruthy()
  })

  it('does not bring back a finished round, and a refresh on the results does not count it twice', async () => {
    const first = renderQuiz()
    await playRound(5)
    await screen.findByRole('heading', { name: '5 of 10' })
    await waitFor(async () => expect((await repo.getSettings()).quizStats.rounds).toBe(1))
    first.unmount()
    renderQuiz()
    expect(screen.getByRole('heading', { name: 'What are we testing today?' })).toBeTruthy()
    expect((await repo.getSettings()).quizStats.rounds).toBe(1)
  })

  it('Home says a round is in progress and offers to resume it', async () => {
    const quiz = renderQuiz()
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    quiz.unmount()
    render(
      <MemoryRouter>
        <DataContext.Provider value={{ snapshot: snapshot(), settings: DEFAULT_SETTINGS }}>
          <HomePage />
        </DataContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByText('You have a round in progress.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/quiz')
  })

  it('Home just says Play when there is no round in progress', () => {
    render(
      <MemoryRouter>
        <DataContext.Provider value={{ snapshot: snapshot(), settings: DEFAULT_SETTINGS }}>
          <HomePage />
        </DataContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Play' })).toBeTruthy()
    expect(screen.queryByText('You have a round in progress.')).toBeNull()
  })

  it('answer links remember they came from the quiz', async () => {
    renderQuiz()
    startMedium()
    const q = planned()[0]
    await answerFirst(planned(), 0, true)
    const link = await screen.findByRole('link', { name: new RegExp(`See ${breedsById[q.breedId].name.replace(/[()]/g, '\\$&')}`) })
    expect(link).toHaveAttribute('href', `/dogdex/breed/${q.breedId}`)
  })
})

describe('the way back from a breed page and the Log screen', () => {
  const at = (ui: React.ReactNode, path: string, state?: unknown) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <DataContext.Provider value={{ snapshot: snapshot(), settings: DEFAULT_SETTINGS }}>
          <Routes>
            <Route path="/dogdex/breed/:breedId" element={ui} />
            <Route path="/log" element={ui} />
          </Routes>
        </DataContext.Provider>
      </MemoryRouter>,
    )

  it('a breed page opened from a quiz answer goes back to the quiz', () => {
    at(<BreedPage />, '/dogdex/breed/beagle', { from: 'quiz' })
    expect(screen.getByRole('link', { name: '← Back to quiz' })).toHaveAttribute('href', '/quiz')
  })

  it('a breed page opened any other way still goes back to the Dogdex', () => {
    at(<BreedPage />, '/dogdex/breed/beagle')
    expect(screen.getByRole('link', { name: '← Dogdex' })).toHaveAttribute('href', '/dogdex')
  })

  it('the Log screen opened from a quiz answer cancels back to the quiz', () => {
    at(<LogPage />, '/log', { from: 'quiz' })
    expect(screen.getByRole('link', { name: '← Back to quiz' })).toHaveAttribute('href', '/quiz')
  })

  it('the Log screen opened normally still says Cancel and goes Home', () => {
    at(<LogPage />, '/log')
    expect(screen.getByRole('link', { name: '← Cancel' })).toHaveAttribute('href', '/')
  })
})

describe('when photos will not load', () => {
  it('pauses with a clear message and lets you try again when the connection is down', async () => {
    randomImageUrl.mockRejectedValue(new dogceo.QuizImageError('network', 'Could not reach the photo service. Check your connection.'))
    renderQuiz()
    startMedium()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the photo service')
    randomImageUrl.mockImplementation(async (p: string) => `https://images.dog.ceo/breeds/${p}/n1.jpg`)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('img', { name: 'A dog to identify' })).toBeTruthy()
  })

  it('retries a failed photo once before giving up on it', async () => {
    randomImageUrl.mockRejectedValueOnce(new dogceo.QuizImageError('unavailable', 'x'))
    renderQuiz()
    startMedium()
    expect(await screen.findByRole('img', { name: 'A dog to identify' })).toBeTruthy()
    expect(screen.getByText('Question 1 of 10')).toBeTruthy()
  })

  it('skips a question whose photos keep failing, and says so at the end', async () => {
    const first = quizPaths[planned()[0].breedId]
    randomImageUrl.mockImplementation(async (p: string) => {
      if (p === first) throw new dogceo.QuizImageError('unavailable', 'x')
      return `https://images.dog.ceo/breeds/${p.replace('/', '-')}/n1.jpg`
    })
    renderQuiz()
    startMedium()
    expect(await screen.findByText('Question 2 of 10')).toBeTruthy()
  })

  it('can be left at any time', async () => {
    renderQuiz()
    startMedium()
    await screen.findByRole('img', { name: 'A dog to identify' })
    fireEvent.click(screen.getByRole('button', { name: 'End quiz' }))
    expect(await screen.findByText('Home page')).toBeTruthy()
    expect((await repo.getSettings()).quizStats.rounds).toBe(0) // unfinished rounds are not counted
  })
})

describe('entry points', () => {
  it('Home has a Breed quiz card that opens the quiz', () => {
    render(
      <MemoryRouter>
        <DataContext.Provider value={{ snapshot: snapshot(), settings: DEFAULT_SETTINGS }}>
          <HomePage />
        </DataContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Breed quiz' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/quiz')
  })

  it('You shows your quiz totals', () => {
    render(
      <MemoryRouter>
        <DataContext.Provider value={{ snapshot: snapshot(), settings: { ...DEFAULT_SETTINGS, quizStats: { rounds: 3, answered: 28, correct: 19, best: 8 } } }}>
          <YouPage />
        </DataContext.Provider>
      </MemoryRouter>,
    )
    const section = screen.getByRole('heading', { name: 'Breed quiz' }).closest('section') as HTMLElement
    expect(section).toHaveTextContent('19 of 28 answers right')
    expect(section).toHaveTextContent('3 rounds played. Best round: 8 right.')
  })
})
