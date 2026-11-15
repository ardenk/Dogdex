import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { BreedPicker } from '../components/BreedPicker'
import { Celebration } from '../components/Celebration'
import { TabBar } from '../components/TabBar'
import { BadgesPage } from '../features/badges/BadgesPage'
import { BreedPage } from '../features/breed/BreedPage'
import { DogdexPage } from '../features/dogdex/DogdexPage'
import { LogPage } from '../features/log/LogPage'
import { HomePage } from '../features/home/HomePage'
import { YouPage } from '../features/you/YouPage'
import { Route, Routes } from 'react-router'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Snapshot } from '../domain/types'
import { DataContext } from '../storage/data-context'
import { AuthContext } from '../sync/auth-context'
import { AccountCard } from '../features/you/AccountCard'

const base = { createdAt: 1, updatedAt: 1 }
const snapshot: Snapshot = {
  dogs: [{ ...base, id: 'd1', breedId: 'rhodesian-ridgeback', name: 'Raffie', ownerName: 'Jen', firstMetAt: Date.now(), lastMetAt: Date.now() }],
  encounters: [{ ...base, id: 'e1', dogId: 'd1', metAt: Date.now(), placeLabel: 'Tribeca' }],
  guesses: [{ ...base, id: 'g1', encounterId: 'e1', dogId: 'd1', guessedBreedId: 'beagle', suggestions: [], confirmedBreedId: 'rhodesian-ridgeback', correct: false, identifierId: 'mock-v1' }],
  awards: [{ badgeId: 'first-dog', earnedAt: Date.now() }],
  stickers: [],
}

const wrap = (ui: React.ReactNode, path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>{ui}</DataContext.Provider>
    </MemoryRouter>,
  )

// jsdom can't compute colors, so contrast is covered separately in contrast.test.ts.
const check = async (container: HTMLElement) => expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()

describe('accessibility (axe)', () => {
  it('Home', async () => check(wrap(<HomePage />).container))
  it('Dogdex grid', async () => check(wrap(<DogdexPage />).container))
  it('Badges', async () => check(wrap(<BadgesPage />).container))
  it('You', async () => check(wrap(<YouPage />).container))
  it('Breed page', async () =>
    check(
      wrap(
        <Routes>
          <Route path="/dogdex/breed/:breedId" element={<BreedPage />} />
        </Routes>,
        '/dogdex/breed/rhodesian-ridgeback',
      ).container,
    ))
  it('Breed picker', async () => check(wrap(<BreedPicker onSelect={() => {}} recentBreedIds={['beagle']} />).container))
  it('Log screen', async () => check(wrap(<LogPage />, '/log').container))
  it('Log screen with a preselected breed and its details', async () => {
    const { container } = wrap(<LogPage />, '/log?breed=beagle')
    await check(container)
  })
  it('Account card, signed out', async () => {
    const value = { enabled: true, loading: false, user: null, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false } as never
    await check(render(<AuthContext.Provider value={{ ...(value as object), signIn: async () => null, signUp: async () => ({}), signOut: async () => {}, syncNow: async () => {}, replaceDeviceData: async () => {}, wipeAll: async () => {} } as never}><AccountCard /></AuthContext.Provider>).container)
  })
  it('Account card, signed in', async () => {
    const value = { enabled: true, loading: false, user: { id: 'u', email: 'a@b.co' }, status: 'idle', lastSyncedAt: Date.now(), error: null, needsAccountChoice: false, signIn: async () => null, signUp: async () => ({}), signOut: async () => {}, syncNow: async () => {}, replaceDeviceData: async () => {}, wipeAll: async () => {} }
    await check(render(<AuthContext.Provider value={value as never}><AccountCard /></AuthContext.Provider>).container)
  })
  it('Tab bar', async () => check(wrap(<TabBar />).container))
  it('Celebration dialog', async () =>
    check(wrap(<Celebration title="A rare find!" glyph="★" badges={[]} onClose={() => {}} />).container))
})
