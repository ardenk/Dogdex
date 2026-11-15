import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/types'
import { LogPage } from '../features/log/LogPage'
import { DataContext } from '../storage/data-context'
import { db } from '../storage/db'
import { repo } from '../storage/localRepo'

const empty = { dogs: [], encounters: [], guesses: [], awards: [], stickers: [] }
const view = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataContext.Provider value={{ snapshot: empty, settings: DEFAULT_SETTINGS }}>
        <LogPage />
      </DataContext.Provider>
    </MemoryRouter>,
  )

beforeEach(async () => {
  await repo.clearAll()
})

describe('Log a dog: names come first', () => {
  it('asks for the dog’s and owner’s names before a breed is chosen', () => {
    view('/log')
    expect(screen.getByLabelText('Dog’s name')).toBeVisible()
    expect(screen.getByLabelText('Owner’s name')).toBeVisible()
    expect(screen.queryByLabelText('Note')).toBeNull() // the rest waits for a breed
    const name = screen.getByLabelText('Dog’s name')
    const breed = screen.getByText('Or pick the breed')
    expect(name.compareDocumentPosition(breed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // names are above the breed picker
  })

  it('shows the note, date and neighborhood once a breed is chosen, with no accordion', () => {
    view('/log?breed=beagle')
    expect(screen.queryByRole('button', { name: /details/i })).toBeNull()
    for (const label of ['Dog’s name', 'Owner’s name', 'Note', 'When', 'Neighborhood']) expect(screen.getByLabelText(label)).toBeVisible()
  })

  it('saves the names typed in the top section with the dog', async () => {
    view('/log?breed=beagle')
    fireEvent.change(screen.getByLabelText('Dog’s name'), { target: { value: 'Biscuit' } })
    fireEvent.change(screen.getByLabelText('Owner’s name'), { target: { value: 'Sam' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save Beagle' }))
    await waitFor(async () => expect(await db.dogs.count()).toBe(1))
    expect(await db.dogs.toCollection().first()).toMatchObject({ name: 'Biscuit', ownerName: 'Sam', breedId: 'beagle' })
  })
})
