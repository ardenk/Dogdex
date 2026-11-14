import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { axe } from 'vitest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Snapshot } from '../domain/types'
import { DogPage } from '../features/dog/DogPage'
import { DataContext } from '../storage/data-context'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'
import { AuthContext } from '../sync/auth-context'
import type { AuthValue } from '../sync/auth-context'

const pic = (t: string) => ({ blob: new Blob([t]), thumb: new Blob([t]), width: 4, height: 3 })
const auth = (over: Partial<AuthValue> = {}): AuthValue => ({
  enabled: true, loading: false, user: null, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false, recovering: false,
  signIn: async () => null, signUp: async () => ({}), requestPasswordReset: async () => null, updatePassword: async () => null, cancelRecovery: () => {},
  signOut: async () => 'done', syncNow: async () => {}, replaceDeviceData: async () => {}, wipeAll: async () => {}, ...over,
})

async function setup(authValue: AuthValue = auth()) {
  const { dog } = await repo.logSighting({ breedId: 'beagle', name: 'Biscuit', metAt: 1, photo: pic('one') })
  await repo.addDogPhoto(dog.id, pic('two'))
  await repo.addDogPhoto(dog.id, pic('three'))
  const snapshot: Snapshot = await repo.getSnapshot()
  const view = render(
    <MemoryRouter initialEntries={[`/dog/${dog.id}`]}>
      <AuthContext.Provider value={authValue}>
        <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
          <Routes>
            <Route path="/dog/:dogId" element={<DogPage />} />
          </Routes>
        </DataContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return { dog, ...view }
}

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  await repo.clearAll()
})
afterEach(() => vi.restoreAllMocks())

describe('dog photos on the dog page', () => {
  it('shows a strip to switch between photos, marking the cover', async () => {
    const { dog, container } = await setup()
    const strip = await screen.findByRole('list', { name: 'Photos of this dog' })
    const items = strip.querySelectorAll('button')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAccessibleName('Photo 1 of 3, cover photo')
    expect(items[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(items[2])
    expect(items[2]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByAltText('Biscuit, photo 3 of 3')).toBeInTheDocument()
    expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBeTruthy()
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('offers camera and library inputs, and the library one accepts several files', async () => {
    await setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Photos/ }))
    expect(screen.getByTestId('add-photo-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('add-photo-library')).toHaveAttribute('multiple')
    expect(screen.getByTestId('add-photo-library')).not.toHaveAttribute('capture')
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'From library' })).toBeEnabled()
  })

  it('makes the selected photo the cover', async () => {
    const { dog } = await setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Photos/ }))
    const strip = await screen.findByRole('list', { name: 'Photos of this dog' })
    fireEvent.click(strip.querySelectorAll('button')[1])
    expect(screen.getByRole('button', { name: 'Make cover' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Make cover' }))
    await waitFor(async () => {
      const ids = (await db.photos.where('dogId').equals(dog.id).sortBy('createdAt')).map((p) => p.id)
      expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBe(ids[1])
    })
  })

  it('deletes the selected photo after asking, and not if you cancel', async () => {
    const { dog } = await setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Photos/ }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete photo' }))
    expect(confirm).toHaveBeenLastCalledWith(expect.stringMatching(/removed from this device\. This can't be undone/))
    expect(await db.photos.where('dogId').equals(dog.id).filter((p) => !p.deletedAt).count()).toBe(3) // cancelled: nothing deleted
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo' }))
    await waitFor(async () => expect(await db.photos.where('dogId').equals(dog.id).filter((p) => !p.deletedAt).count()).toBe(2))
    // the cover (the first photo) was deleted, so another photo took over
    expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBeTruthy()
  })

  it('warns that a signed-in person is also deleting the cloud copy', async () => {
    await setup(auth({ user: { id: 'u', email: 'a@b.co' } }))
    fireEvent.click(await screen.findByRole('button', { name: /^Photos/ }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete photo' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('from your cloud backup'))
  })

  it('stickers are only drawn on the cover photo', async () => {
    const { dog } = await setup()
    await repo.addSticker(dog.id, { giphyId: 'a', url: 'https://media1.giphy.com/media/a/200w.gif', width: 100, height: 100 })
    const snapshot = await repo.getSnapshot()
    // re-render with the sticker in the snapshot
    document.body.innerHTML = ''
    const { container } = render(
      <MemoryRouter initialEntries={[`/dog/${dog.id}`]}>
        <AuthContext.Provider value={auth()}>
          <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
            <Routes>
              <Route path="/dog/:dogId" element={<DogPage />} />
            </Routes>
          </DataContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    const strip = await screen.findByRole('list', { name: 'Photos of this dog' })
    expect(container.querySelector('.sticker')).not.toBeNull() // cover showing
    fireEvent.click(strip.querySelectorAll('button')[2])
    expect(container.querySelector('.sticker')).toBeNull() // another photo showing
    fireEvent.click(strip.querySelectorAll('button')[0])
    expect(container.querySelector('.sticker')).not.toBeNull()
  })
})
