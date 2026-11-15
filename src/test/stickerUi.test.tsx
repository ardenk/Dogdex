import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext } from '../sync/auth-context'
import type { AuthValue } from '../sync/auth-context'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StickerLayer } from '../components/StickerLayer'
import { DogPage } from '../features/dog/DogPage'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DataContext } from '../storage/data-context'
import { repo } from '../storage/localRepo'
import type { Sticker } from '../domain/types'

vi.mock('../services/giphy', async () => {
  const real = await vi.importActual<typeof import('../services/giphy')>('../services/giphy')
  const stickers = [
    { giphyId: 'a', title: 'Happy dog', url: 'https://media1.giphy.com/media/a/200w.webp', stillUrl: 'https://media1.giphy.com/media/a/200w_s.gif', width: 200, height: 160 },
    { giphyId: 'b', title: 'Party', url: 'https://media1.giphy.com/media/b/200w.webp', width: 200, height: 200 },
  ]
  return { ...real, giphyEnabled: true, trendingStickers: async () => ({ stickers, nextOffset: null }), searchStickers: async () => ({ stickers: [stickers[1]], nextOffset: null }) }
})

import { StickerPicker } from '../components/StickerPicker'

const base = { createdAt: 1, updatedAt: 1, dogId: 'd', width: 200, height: 160, rotation: 0, scale: 0.3, z: 1 }
const stickers: Sticker[] = [
  { ...base, id: 's1', giphyId: 'a', title: 'Happy dog', url: 'https://media1.giphy.com/media/a/200w.webp', x: 0.3, y: 0.4 },
  { ...base, id: 's2', giphyId: 'evil', title: 'Tracker', url: 'https://evil.example/pixel.gif', x: 0.6, y: 0.6 },
]
const noViolations = async (c: HTMLElement) => expect(await axe(c, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()

const authValue = (over: Partial<AuthValue> = {}): AuthValue => ({
  enabled: true, loading: false, user: { id: 'u', email: 'a@b.co' }, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false, recovering: false,
  signIn: async () => null, signUp: async () => ({}), requestPasswordReset: async () => null, updatePassword: async () => null, cancelRecovery: () => {},
  signOut: async () => 'done', syncNow: async () => {}, replaceDeviceData: async () => {}, wipeAll: async () => {}, ...over,
})
const picker = (props: { onPick?: () => void; onClose?: () => void } = {}, auth: Partial<AuthValue> = {}) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue(auth)}>
        <StickerPicker onPick={props.onPick ?? (() => {})} onClose={props.onClose ?? (() => {})} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )

describe('StickerPicker', () => {
  it('shows trending stickers, attribution and the privacy note, and has no a11y violations', async () => {
    const { container } = picker()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add sticker: Happy dog' })).toBeInTheDocument())
    expect(screen.getByText('Powered by GIPHY')).toHaveAttribute('href', 'https://giphy.com')
    expect(screen.getByText(/shares your search words with GIPHY/i)).toBeInTheDocument()
    await noViolations(container)
  })
  it('hands the chosen sticker back', async () => {
    const onPick = vi.fn()
    picker({ onPick })
    fireEvent.click(await screen.findByRole('button', { name: 'Add sticker: Party' }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ giphyId: 'b' }))
  })
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    picker({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  it('asks signed-out people to sign in instead of searching', async () => {
    const { container } = picker({}, { user: null })
    expect(screen.getByText('Sign in to add stickers.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/you')
    expect(screen.queryByRole('searchbox')).toBeNull()
    await noViolations(container)
  })
})

describe('StickerLayer', () => {
  it('never renders an image that is not hosted by GIPHY', () => {
    const { container } = render(<div style={{ position: 'relative' }}><StickerLayer stickers={stickers} /></div>)
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['https://media1.giphy.com/media/a/200w.webp'])
  })
  it("doesn't send the page address to GIPHY when loading images", () => {
    const { container } = render(<StickerLayer stickers={stickers} />)
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
  it('can be moved with the keyboard while editing', () => {
    const onChange = vi.fn()
    render(<StickerLayer stickers={stickers} editing selectedId="s1" onChange={onChange} />)
    const el = screen.getByRole('button', { name: /Happy dog/ })
    fireEvent.keyDown(el, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('s1', { x: expect.closeTo(0.32, 5), y: 0.4 })
    fireEvent.keyDown(el, { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('s1', { x: 0.3, y: expect.closeTo(0.3, 5) })
  })
  it('is inert when not editing, and has no a11y violations either way', async () => {
    const view = render(<StickerLayer stickers={stickers} />)
    expect(screen.queryByRole('button')).toBeNull()
    await noViolations(view.container)
    view.unmount()
    const editing = render(<StickerLayer stickers={stickers} editing selectedId="s1" />)
    await noViolations(editing.container)
  })
})

describe('DogPage with stickers', () => {
  // The dog needs a photo: stickers live on a photo, and the Edit button is on the photo.
  const view = async () => {
    await repo.clearAll()
    const { dog } = await repo.logSighting({ breedId: 'beagle', name: 'Biscuit', metAt: 1, photo: { blob: new Blob(['a']), thumb: new Blob(['a']), width: 4, height: 3 } })
    const photoId = (await repo.getSnapshot()).dogs.find((d) => d.id === dog.id)!.primaryPhotoId!
    const placed = await repo.addSticker(dog.id, { photoId, giphyId: 'a', title: 'Happy dog', url: 'https://media1.giphy.com/media/a/200w.webp', width: 200, height: 160 })
    const snapshot = await repo.getSnapshot()
    expect(placed.photoId).toBe(photoId)
    return render(
      <MemoryRouter initialEntries={[`/dog/${dog.id}`]}>
        <DataContext.Provider value={{ snapshot, settings: DEFAULT_SETTINGS }}>
          <Routes>
            <Route path="/dog/:dogId" element={<DogPage />} />
          </Routes>
        </DataContext.Provider>
      </MemoryRouter>,
    )
  }
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }))
  })

  it('renders a dog that has stickers, with no a11y violations (regression: it used to crash)', async () => {
    const { container } = await view()
    expect(screen.getByRole('heading', { name: 'Biscuit' })).toBeInTheDocument()
    expect(container.querySelector('.sticker img')).toHaveAttribute('alt', 'Happy dog')
    await noViolations(container)
  })

  it('opens the edit controls and lets you pick the sticker and see its controls', async () => {
    const { container } = await view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit photo' }))
    expect(screen.getByRole('button', { name: 'Add a sticker' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: /Happy dog/ }), { key: 'Enter' })
    expect(await screen.findByLabelText('Size')).toBeInTheDocument()
    expect(screen.getByLabelText('Rotate')).toBeInTheDocument()
    await noViolations(container)
  })
})
