import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DogPage } from '../features/dog/DogPage'
import { DataProvider } from '../storage/DataProvider'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'
import { AuthContext } from '../sync/auth-context'
import type { AuthValue } from '../sync/auth-context'

vi.mock('../services/giphy', async () => {
  const real = await vi.importActual<typeof import('../services/giphy')>('../services/giphy')
  const stickers = [{ giphyId: 'a', title: 'Happy dog', url: 'https://media1.giphy.com/media/a/200w.webp', width: 200, height: 160 }]
  return { ...real, giphyEnabled: true, trendingStickers: async () => ({ stickers, nextOffset: null }), searchStickers: async () => ({ stickers, nextOffset: null }) }
})

const auth = { enabled: true, loading: false, user: { id: 'u' }, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false, recovering: false } as unknown as AuthValue
const pic = (t: string) => ({ blob: new Blob([t]), thumb: new Blob([t + 't']), width: 400, height: 300 })
const sticker = { giphyId: 'a', title: 'Happy dog', url: 'https://media1.giphy.com/media/a/200w.webp', width: 200, height: 160 }

/** A dog with two photos (the first is the cover), shown through the real data provider so edits appear as they do in the app. */
async function page(opts: { photos?: 0 | 1 | 2 } = {}) {
  const photos = opts.photos ?? 2
  const { dog } = await repo.logSighting({ breedId: 'beagle', name: 'King', metAt: 1, photo: photos > 0 ? pic('one') : undefined })
  const ids: string[] = []
  const first = (await repo.getSnapshot()).dogs.find((d) => d.id === dog.id)!.primaryPhotoId
  if (first) ids.push(first)
  if (photos > 1) ids.push((await repo.addDogPhoto(dog.id, pic('two'))).id)
  render(
    <MemoryRouter initialEntries={[`/dog/${dog.id}`]}>
      <AuthContext.Provider value={auth}>
        <DataProvider>
          <Routes>
            <Route path="/dog/:dogId" element={<DogPage />} />
          </Routes>
        </DataProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return { dog, ids }
}

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  await repo.clearAll()
})
afterEach(() => vi.restoreAllMocks())

/** True when `a` comes before `b` in the page. */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const hero = () => document.querySelector('.hero') as HTMLElement
const editButton = () => within(hero()).queryByRole('button', { name: 'Edit photo' })
const addTile = () => screen.getByRole('button', { name: 'Add a photo' })
const name = () => screen.getByRole('heading', { level: 1, name: 'King' })
const liveStickers = async (dogId: string) => (await db.stickers.where('dogId').equals(dogId).toArray()).filter((s) => !s.deletedAt)

describe('the photo area: strip, + tile, Edit button', () => {
  it('has no separate Photos and Stickers buttons any more', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    expect(screen.queryByRole('button', { name: /^Photos/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stickers' })).toBeNull()
  })

  it('shows the photos with a "+" tile after the last one, under the photo and above the dog’s name', async () => {
    await page()
    const photo = await screen.findByAltText(/King, photo 1 of 2/)
    const strip = screen.getByRole('list', { name: 'Photos of this dog' })
    const thumbs = strip.querySelectorAll('.photo-strip__item:not(.photo-strip__add)')
    expect(thumbs).toHaveLength(2)
    const plus = addTile()
    expect(strip.contains(plus)).toBe(true)
    expect(before(thumbs[1], plus)).toBe(true) // the "+" is last
    expect(plus).toHaveTextContent('+')
    expect(before(photo, strip)).toBe(true)
    expect(before(strip, name())).toBe(true)
  })

  it('shows the strip, with just the "+" tile, for a dog with no photo yet', async () => {
    await page({ photos: 0 })
    await screen.findByRole('heading', { level: 1, name: 'King' })
    const strip = screen.getByRole('list', { name: 'Photos of this dog' })
    expect(strip.querySelectorAll('.photo-strip__item:not(.photo-strip__add)')).toHaveLength(0)
    expect(addTile()).toBeEnabled()
    expect(editButton()).toBeNull() // nothing to edit yet
  })

  it('puts an Edit button in the photo’s bottom corner when a photo is selected', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    expect(editButton()).toBeTruthy()
    // It follows the selection: choosing the other photo, the button is still there.
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' }))
    expect(await screen.findByAltText(/King, photo 2 of 2/)).toBeTruthy()
    expect(editButton()).toBeTruthy()
  })

  it('the "+" tile is disabled once a dog has the most photos it can have', async () => {
    const { dog } = await page({ photos: 1 })
    await screen.findByAltText(/King/)
    for (let i = 0; i < 11; i++) await repo.addDogPhoto(dog.id, pic(`p${i}`))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Add a photo \(this dog has the most/ })).toBeDisabled())
  })
})

describe('adding a photo: upload options only', () => {
  it('the "+" tile opens a frame under the strip with the upload options, and nothing for editing', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    expect(addTile()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(addTile())
    expect(addTile()).toHaveAttribute('aria-expanded', 'true')
    const frame = await screen.findByRole('heading', { level: 2, name: 'Add a photo' })
    expect(before(screen.getByRole('list', { name: 'Photos of this dog' }), frame)).toBe(true)
    expect(before(frame, name())).toBe(true)
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'From library' })).toBeEnabled()
    expect(screen.getByTestId('add-photo-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('add-photo-library')).toHaveAttribute('multiple')
    // No editing controls here.
    for (const label of ['Adjust framing', 'Make cover', 'Delete photo', 'Add a sticker']) expect(screen.queryByRole('button', { name: label })).toBeNull()
    expect(screen.queryByText('Stickers on this photo')).toBeNull()
  })

  it('Cancel, or the "+" tile again, closes it', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(addTile())
    await screen.findByRole('heading', { level: 2, name: 'Add a photo' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { level: 2, name: 'Add a photo' })).toBeNull()
    fireEvent.click(addTile())
    fireEvent.click(addTile())
    expect(screen.queryByRole('heading', { level: 2, name: 'Add a photo' })).toBeNull()
  })

  it('choosing a photo in the strip closes it', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(addTile())
    await screen.findByRole('heading', { level: 2, name: 'Add a photo' })
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' }))
    expect(screen.queryByRole('heading', { level: 2, name: 'Add a photo' })).toBeNull()
  })
})

describe('editing the photo shown', () => {
  it('Edit opens the controls right under the photo, before the dog’s name, and hides the Edit button and the thumbnails', async () => {
    await page()
    const photo = await screen.findByAltText(/King, photo 1 of 2/)
    expect(screen.getByRole('list', { name: 'Photos of this dog' })).toBeTruthy()
    fireEvent.click(editButton()!)
    const frame = await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    expect(before(photo, frame)).toBe(true)
    expect(before(frame, name())).toBe(true)
    expect(before(frame, screen.getByRole('button', { name: 'Met again' }))).toBe(true)
    expect(editButton()).toBeNull()
    expect(screen.queryByRole('list', { name: 'Photos of this dog' })).toBeNull() // no thumbnails while editing
    expect(screen.queryByRole('button', { name: 'Add a photo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByRole('list', { name: 'Photos of this dog' })).toBeTruthy() // and they come back
  })

  it('has cover, sticker, framing and delete together, in that order, with Cancel and Done', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    const order = ['★ Cover photo', 'Add a sticker', 'Adjust framing', 'Delete photo']
    const buttons = order.map((label) => screen.getByRole('button', { name: label }))
    expect(buttons[0]).toBeDisabled() // photo 1 is the cover
    for (let i = 1; i < buttons.length; i++) expect(before(buttons[i - 1], buttons[i])).toBe(true)
    expect(buttons[0].parentElement).toBe(buttons[3].parentElement) // one group
    expect(screen.getByText(/0\/8 stickers on this photo/)).toBeTruthy()
    for (const label of ['Cancel', 'Done']) expect(screen.getByRole('button', { name: label })).toBeTruthy()
    // Taking photos is a separate step: not here.
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull()
  })

  it('the Edit button comes back on Done and on Cancel', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    for (const leave of ['Done', 'Cancel']) {
      fireEvent.click(editButton()!)
      await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
      fireEvent.click(screen.getByRole('button', { name: leave }))
      await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Edit photo' })).toBeNull())
      expect(editButton()).toBeTruthy()
    }
  })

  it('Make cover and Delete work on the photo being edited', async () => {
    const { dog, ids } = await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' }))
    await screen.findByAltText(/King, photo 2 of 2/)
    fireEvent.click(editButton()!)
    fireEvent.click(await screen.findByRole('button', { name: 'Make cover' }))
    await waitFor(async () => expect((await db.dogs.get(dog.id))?.primaryPhotoId).toBe(ids[1]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete photo' }))
    await waitFor(async () => expect((await db.photos.get(ids[1]))?.deletedAt).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole('heading', { level: 2, name: 'Edit photo' })).toBeNull()) // closes after deleting
  })

  it('Adjust framing opens the framing editor inside the edit controls', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    fireEvent.click(await screen.findByRole('button', { name: 'Adjust framing' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Adjust framing' })).toBeTruthy()
  })
})

describe('stickers sit on one photo', () => {
  const addOne = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add a sticker' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add sticker: Happy dog' }))
    await screen.findByLabelText('Size')
  }

  it('shows "Add a sticker" only when no sticker is selected', async () => {
    await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    expect(screen.getByRole('button', { name: 'Add a sticker' })).toBeTruthy()
    expect(screen.queryByLabelText('Size')).toBeNull()
    await addOne() // adding selects the new sticker
    expect(screen.queryByRole('button', { name: 'Add a sticker' })).toBeNull()
    expect(screen.getByLabelText('Rotate')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bring to front' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('button', { name: 'Add a sticker' })).toBeTruthy()
  })

  it('a new sticker goes on the photo being edited, not on the cover', async () => {
    const { dog, ids } = await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: 'Photo 2 of 2' })) // not the cover
    await screen.findByAltText(/King, photo 2 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    await addOne()
    const [s] = await liveStickers(dog.id)
    expect(s.photoId).toBe(ids[1])
  })

  it('each photo shows only its own stickers, and the count is per photo', async () => {
    const { dog, ids } = await page()
    await repo.addSticker(dog.id, { ...sticker, photoId: ids[0] })
    await repo.addSticker(dog.id, { ...sticker, photoId: ids[0], giphyId: 'b' })
    await screen.findByAltText(/King, photo 1 of 2/)
    await waitFor(() => expect(hero().querySelectorAll('.sticker')).toHaveLength(2))
    fireEvent.click(editButton()!)
    expect(await screen.findByText(/2\/8 stickers on this photo/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Photo 2 of 2' }))
    await screen.findByAltText(/King, photo 2 of 2/)
    expect(hero().querySelectorAll('.sticker')).toHaveLength(0)
    fireEvent.click(editButton()!)
    expect(await screen.findByText(/0\/8 stickers on this photo/)).toBeTruthy()
  })

  it('with a sticker selected, only the sticker controls show; deselecting brings the photo controls back', async () => {
    const { dog, ids } = await page()
    const placed = await repo.addSticker(dog.id, { ...sticker, photoId: ids[0] })
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    fireEvent.keyDown(await screen.findByRole('button', { name: /Happy dog/ }), { key: 'Enter' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Edit sticker' })).toBeTruthy()
    for (const label of ['Make cover', '★ Cover photo', 'Add a sticker', 'Adjust framing', 'Delete photo']) expect(screen.queryByRole('button', { name: label })).toBeNull()
    expect(screen.getByLabelText('Size')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bring to front' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByRole('button', { name: 'Add a sticker' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adjust framing' })).toBeTruthy()
    expect((await liveStickers(dog.id)).find((s) => s.id === placed.id)).toBeUndefined()
  })

  it('stickers stay on their photo when the cover changes', async () => {
    const { dog, ids } = await page()
    await repo.addSticker(dog.id, { ...sticker, photoId: ids[0] })
    await screen.findByAltText(/King, photo 1 of 2/)
    await repo.setPrimaryPhoto(dog.id, ids[1])
    fireEvent.click(await screen.findByRole('button', { name: 'Photo 2 of 2, cover photo' }))
    await screen.findByAltText(/King, photo 2 of 2/)
    expect(hero().querySelectorAll('.sticker')).toHaveLength(0) // the new cover has none of the old cover's stickers
    fireEvent.click(screen.getByRole('button', { name: 'Photo 1 of 2' }))
    await screen.findByAltText(/King, photo 1 of 2/)
    await waitFor(() => expect(hero().querySelectorAll('.sticker')).toHaveLength(1))
  })

  it('Done keeps what you did, and Cancel takes back a sticker you added', async () => {
    const { dog } = await page()
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    await addOne()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await liveStickers(dog.id)).toHaveLength(1)

    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    await addOne()
    expect(await liveStickers(dog.id)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(async () => expect(await liveStickers(dog.id)).toHaveLength(1))
  })

  it('Cancel puts back a sticker you moved or removed', async () => {
    const { dog, ids } = await page()
    const existing = await repo.addSticker(dog.id, { ...sticker, photoId: ids[0] })
    await screen.findByAltText(/King, photo 1 of 2/)
    fireEvent.click(editButton()!)
    await screen.findByRole('heading', { level: 2, name: 'Edit photo' })
    await repo.updateSticker(existing.id, { x: 0.9, y: 0.1, scale: 0.9 })
    await repo.removeSticker(existing.id)
    expect(await liveStickers(dog.id)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(async () => expect(await liveStickers(dog.id)).toHaveLength(1))
    expect((await liveStickers(dog.id))[0]).toMatchObject({ id: existing.id, x: existing.x, y: existing.y, scale: existing.scale })
  })
})
