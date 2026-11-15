import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { axe } from 'vitest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoFraming } from '../components/PhotoFraming'
import { PhotoEditor } from '../components/PhotoEditor'
import { objectPosition } from '../domain/photoFocus'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DogPage } from '../features/dog/DogPage'
import { DataContext } from '../storage/data-context'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'
import { AuthContext } from '../sync/auth-context'
import type { AuthValue } from '../sync/auth-context'

// A tall (portrait) photo, so it has to be cropped to fit the 4:3 box: the case where a head gets cut off.
const portrait = { blob: new Blob(['full']), thumb: new Blob(['thumb']), width: 300, height: 400 }
const auth = { enabled: false, loading: false, user: null, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false, recovering: false } as unknown as AuthValue

async function logDog() {
  const { dog } = await repo.logSighting({ breedId: 'beagle', name: 'King', metAt: 1, photo: portrait })
  const snapshot = await repo.getSnapshot()
  const photoId = snapshot.dogs.find((d) => d.id === dog.id)!.primaryPhotoId!
  return { dog: snapshot.dogs.find((d) => d.id === dog.id)!, photoId, snapshot }
}

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  await repo.clearAll()
})
afterEach(() => vi.restoreAllMocks())

const sliders = () => ({
  x: screen.getByLabelText('Left to right') as HTMLInputElement,
  y: screen.getByLabelText('Top to bottom') as HTMLInputElement,
})
const marker = (c: HTMLElement) => c.querySelector('.framing__marker') as HTMLElement
const previewStyle = () => (screen.getByTestId('framing-preview').querySelector('img') as HTMLImageElement).style.objectPosition

describe('Adjust framing', () => {
  it('starts centered, with the whole photo, a preview of the crop, and a way to nudge the point', async () => {
    const { photoId } = await logDog()
    const { container } = render(<PhotoFraming photoId={photoId} onDone={() => {}} />)
    await screen.findByAltText(/The whole photo/)
    expect(sliders().x.value).toBe('50')
    expect(sliders().y.value).toBe('50')
    expect(marker(container).style.left).toBe('50%')
    await waitFor(() => expect(previewStyle()).toBe(objectPosition({ x: 0.5, y: 0.5 }, 300, 400)))
  })

  it('moves the point with the sliders, and the preview follows', async () => {
    const { photoId } = await logDog()
    const { container } = render(<PhotoFraming photoId={photoId} onDone={() => {}} />)
    await screen.findByAltText(/The whole photo/)
    fireEvent.change(sliders().y, { target: { value: '20' } })
    expect(marker(container).style.top).toBe('20%')
    expect(previewStyle()).toBe(objectPosition({ x: 0.5, y: 0.2 }, 300, 400))
    expect(previewStyle()).not.toBe('50% 50%') // the crop really moved: a head near the top is kept
  })

  it('moves the point when you tap the photo', async () => {
    const { photoId } = await logDog()
    const { container } = render(<PhotoFraming photoId={photoId} onDone={() => {}} />)
    await screen.findByAltText(/The whole photo/)
    const frame = container.querySelector('.framing') as HTMLElement
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) })
    fireEvent.pointerDown(frame, { clientX: 60, clientY: 40, pointerId: 1, buttons: 1 })
    expect(sliders().x.value).toBe('25') // (60 - 10) / 200
    expect(sliders().y.value).toBe('20') // (40 - 20) / 100
    fireEvent.pointerMove(frame, { clientX: 10, clientY: 120, pointerId: 1, buttons: 1 })
    expect(sliders().x.value).toBe('0')
    expect(sliders().y.value).toBe('100')
    fireEvent.pointerMove(frame, { clientX: 900, clientY: -50, pointerId: 1, buttons: 1 }) // dragged past the edge: stays inside the photo
    expect(sliders().x.value).toBe('100')
    expect(sliders().y.value).toBe('0')
  })

  it('saves the framing with the photo and closes', async () => {
    const { photoId } = await logDog()
    const done = vi.fn()
    render(<PhotoFraming photoId={photoId} onDone={done} />)
    await screen.findByAltText(/The whole photo/)
    fireEvent.change(sliders().x, { target: { value: '30' } })
    fireEvent.change(sliders().y, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(await db.photos.get(photoId)).toMatchObject({ focusX: 0.3, focusY: 0.15 })
  })

  it('Cancel leaves the photo as it was', async () => {
    const { photoId } = await logDog()
    const done = vi.fn()
    render(<PhotoFraming photoId={photoId} onDone={done} />)
    await screen.findByAltText(/The whole photo/)
    fireEvent.change(sliders().y, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(done).toHaveBeenCalled()
    expect((await db.photos.get(photoId))?.focusY).toBeUndefined()
  })

  it('Center puts the point back in the middle, and Save keeps that', async () => {
    const { photoId } = await logDog()
    await repo.setPhotoFocus(photoId, { x: 0.8, y: 0.1 })
    render(<PhotoFraming photoId={photoId} onDone={() => {}} />)
    await waitFor(() => expect(sliders().x.value).toBe('80')) // opens on what was saved
    fireEvent.click(screen.getByRole('button', { name: 'Center' }))
    expect(sliders().x.value).toBe('50')
    expect(sliders().y.value).toBe('50')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await db.photos.get(photoId)).toMatchObject({ focusX: 0.5, focusY: 0.5 }))
  })

  it('has no accessibility violations', async () => {
    const { photoId } = await logDog()
    const { container } = render(<PhotoFraming photoId={photoId} onDone={() => {}} />)
    await screen.findByAltText(/The whole photo/)
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('Adjust framing in the photo editor', () => {
  const editor = (dog: Awaited<ReturnType<typeof logDog>>['dog'], photoId: string) =>
    render(
      <AuthContext.Provider value={auth}>
        <PhotoEditor dog={dog} photoId={photoId} stickers={[]} selected={null} onSelect={() => {}} onOpenPicker={() => {}} onDeleted={() => {}} onCancel={() => {}} onDone={() => {}} />
      </AuthContext.Provider>,
    )

  it('opens and closes the framing editor for the photo being edited', async () => {
    const { dog, photoId } = await logDog()
    editor(dog, photoId)
    const button = screen.getByRole('button', { name: 'Adjust framing' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('heading', { name: 'Adjust framing' })).toBeTruthy()
    // The framing editor has its own Cancel; the editor's Cancel is the other one.
    fireEvent.click(within(screen.getByRole('heading', { name: 'Adjust framing' }).closest('section, div')!.parentElement!).getAllByRole('button', { name: 'Cancel' })[0])
    expect(screen.queryByRole('heading', { name: 'Adjust framing' })).toBeNull()
  })
})

describe('the saved framing is used wherever the photo is cropped', () => {
  const dogPage = (snapshot: Awaited<ReturnType<typeof logDog>>['snapshot'], dogId: string) =>
    render(
      <MemoryRouter initialEntries={[`/dog/${dogId}`]}>
        <AuthContext.Provider value={auth}>
          <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
            <Routes>
              <Route path="/dog/:dogId" element={<DogPage />} />
            </Routes>
          </DataContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

  it('the dog page photo keeps the head in view (it is not just centered)', async () => {
    const { dog, photoId, snapshot } = await logDog()
    await repo.setPhotoFocus(photoId, { x: 0.5, y: 0.1 }) // a head near the top of a tall photo
    dogPage(snapshot, dog.id)
    const img = (await screen.findByAltText(/King/)) as HTMLImageElement
    await waitFor(() => expect(img.style.objectPosition).toBe(objectPosition({ x: 0.5, y: 0.1 }, 300, 400)))
    expect(img.style.objectPosition).toBe('50% 0%') // the top of the photo
  })

  it('a photo with no framing is centered, as before', async () => {
    const { dog, snapshot } = await logDog()
    dogPage(snapshot, dog.id)
    const img = (await screen.findByAltText(/King/)) as HTMLImageElement
    await waitFor(() => expect(img.style.objectPosition).toBe('50% 50%'))
  })
})
