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

const thumbs = (strip: HTMLElement) => Array.from(strip.querySelectorAll<HTMLButtonElement>('button:not(.photo-strip__add)'))
const openEdit = async () => fireEvent.click(await screen.findByRole('button', { name: 'Edit photo' }))

describe('dog photos on the dog page', () => {
  it('shows a strip to switch between photos, marking the cover, with a "+" tile at the end', async () => {
    const { dog, container } = await setup()
    const strip = await screen.findByRole('list', { name: 'Photos of this dog' })
    await waitFor(() => expect(thumbs(strip)).toHaveLength(3)) // the photos load a moment after the page
    const items = thumbs(strip)
    expect(items[0]).toHaveAccessibleName('Photo 1 of 3, cover photo')
    expect(items[0]).toHaveAttribute('aria-pressed', 'true')
    expect(strip.querySelector('.photo-strip__add')).toBe(strip.querySelectorAll('button')[3])
    fireEvent.click(items[2])
    expect(items[2]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByAltText('Biscuit, photo 3 of 3')).toBeInTheDocument()
    expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBeTruthy()
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('the "+" tile offers camera and library inputs, and the library one accepts several files', async () => {
    await setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a photo' }))
    expect(screen.getByTestId('add-photo-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('add-photo-library')).toHaveAttribute('multiple')
    expect(screen.getByTestId('add-photo-library')).not.toHaveAttribute('capture')
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'From library' })).toBeEnabled()
  })

  it('makes the selected photo the cover', async () => {
    const { dog } = await setup()
    const strip = await screen.findByRole('list', { name: 'Photos of this dog' })
    await waitFor(() => expect(thumbs(strip)).toHaveLength(3))
    fireEvent.click(thumbs(strip)[1])
    await openEdit()
    expect(screen.getByRole('button', { name: 'Make cover' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Make cover' }))
    await waitFor(async () => {
      const ids = (await db.photos.where('dogId').equals(dog.id).sortBy('createdAt')).map((p) => p.id)
      expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBe(ids[1])
    })
  })

  it('deletes the selected photo after asking, and not if you cancel', async () => {
    const { dog } = await setup()
    await openEdit()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete photo' }))
    expect(confirm).toHaveBeenLastCalledWith(expect.stringMatching(/removed from this device, along with its stickers\. This can't be undone/))
    expect(await db.photos.where('dogId').equals(dog.id).filter((p) => !p.deletedAt).count()).toBe(3) // cancelled: nothing deleted
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo' }))
    await waitFor(async () => expect(await db.photos.where('dogId').equals(dog.id).filter((p) => !p.deletedAt).count()).toBe(2))
    // the cover (the first photo) was deleted, so another photo took over
    expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBeTruthy()
  })

  it('warns that a signed-in person is also deleting the cloud copy', async () => {
    await setup(auth({ user: { id: 'u', email: 'a@b.co' } }))
    await openEdit()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete photo' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('from your cloud backup'))
  })

  it('deleting a photo takes its stickers with it', async () => {
    const { dog } = await setup()
    const photos = await db.photos.where('dogId').equals(dog.id).sortBy('createdAt')
    await repo.addSticker(dog.id, { photoId: photos[0].id, giphyId: 'a', url: 'https://media1.giphy.com/media/a/200w.gif', width: 100, height: 100 })
    await repo.addSticker(dog.id, { photoId: photos[1].id, giphyId: 'b', url: 'https://media1.giphy.com/media/b/200w.gif', width: 100, height: 100 })
    await repo.deletePhoto(photos[0].id)
    const live = (await db.stickers.where('dogId').equals(dog.id).toArray()).filter((s) => !s.deletedAt)
    expect(live.map((s) => s.photoId)).toEqual([photos[1].id])
  })

  it('stickers are drawn only on the photo they were put on', async () => {
    const { dog } = await setup()
    const photos = await db.photos.where('dogId').equals(dog.id).sortBy('createdAt')
    await repo.addSticker(dog.id, { photoId: photos[1].id, giphyId: 'a', url: 'https://media1.giphy.com/media/a/200w.gif', width: 100, height: 100 })
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
    await waitFor(() => expect(thumbs(strip)).toHaveLength(3))
    expect(container.querySelector('.sticker')).toBeNull() // the cover is showing, and the sticker is on photo 2
    fireEvent.click(thumbs(strip)[1])
    expect(container.querySelector('.sticker')).not.toBeNull()
    fireEvent.click(thumbs(strip)[2])
    expect(container.querySelector('.sticker')).toBeNull()
  })
})
