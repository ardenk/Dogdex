import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { axe } from 'vitest-axe'
import { describe, expect, it, vi } from 'vitest'
import { AccountCard } from '../features/you/AccountCard'
import { LogPage } from '../features/log/LogPage'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DataContext } from '../storage/data-context'
import { AuthContext } from '../sync/auth-context'
import type { AuthValue } from '../sync/auth-context'

const auth = (over: Partial<AuthValue> = {}): AuthValue => ({
  enabled: true, loading: false, user: null, status: 'idle', lastSyncedAt: null, error: null, needsAccountChoice: false, recovering: false,
  signIn: async () => null, signUp: async () => ({}), requestPasswordReset: async () => null, updatePassword: async () => null, cancelRecovery: () => {},
  signOut: async () => 'done', syncNow: async () => {}, replaceDeviceData: async () => {}, wipeAll: async () => {}, ...over,
})
const renderCard = (value: AuthValue) => render(<AuthContext.Provider value={value}><AccountCard /></AuthContext.Provider>)
const noViolations = async (c: HTMLElement) => expect(await axe(c, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()

describe('forgot password', () => {
  it('asks for just an email, sends the link, and answers the same way for any address', async () => {
    const requestPasswordReset = vi.fn(async () => null)
    const { container } = renderCard(auth({ requestPasswordReset }))
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).toBeNull()
    await noViolations(container)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }))
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('sam@example.com'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/If there’s an account for that email/)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument() // back on the sign-in form
  })

  it('shows an error if the link could not be sent (for example, too many requests)', async () => {
    renderCard(auth({ requestPasswordReset: async () => 'Email rate limit exceeded' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Email me a reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded')
  })

  it('tells people when an old reset link no longer works', () => {
    renderCard(auth({ recovering: true, user: null }))
    expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/)
  })
})

describe('choosing a new password', () => {
  const signedIn = { id: 'u', email: 'sam@example.com' }

  it('saves a matching password of 8+ characters', async () => {
    const updatePassword = vi.fn(async () => null)
    const { container } = renderCard(auth({ recovering: true, user: signedIn, updatePassword }))
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    await noViolations(container)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'correct horse' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('correct horse'))
  })

  it("won't save mismatched or short passwords", async () => {
    const updatePassword = vi.fn(async () => null)
    renderCard(auth({ recovering: true, user: signedIn, updatePassword }))
    const form = screen.getByRole('button', { name: 'Save new password' }).closest('form')!
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'different11' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'short' } })
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8')
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('shows the error if Supabase refuses the new password', async () => {
    renderCard(auth({ recovering: true, user: signedIn, updatePassword: async () => 'New password should be different from the old password.' }))
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'samepassword1' } })
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'samepassword1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('should be different')
  })
})

describe('adding a photo', () => {
  const empty = { dogs: [], encounters: [], guesses: [], awards: [], stickers: [] }
  it('offers both the camera and the photo library', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/log']}>
        <DataContext.Provider value={{ snapshot: empty, settings: DEFAULT_SETTINGS }}>
          <LogPage />
        </DataContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'From library' })).toBeInTheDocument()
    // The camera input opens the camera directly; the library input has no `capture`, so phones show their photo library.
    expect(screen.getByTestId('photo-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('photo-library')).not.toHaveAttribute('capture')
    expect(screen.getByTestId('photo-library')).toHaveAttribute('accept', 'image/*')
    await noViolations(container)
  })
})
