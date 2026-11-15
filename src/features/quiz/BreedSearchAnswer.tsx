import { useId, useMemo, useState } from 'react'
import { breedsById, data } from '../../data'
import { searchBreeds } from '../../domain/search'

/** How many matches to list. Enough to find a breed, few enough to scroll past on a phone. */
const MAX_MATCHES = 8

interface Props {
  /** Called with the chosen breed's id, or null for "I don't know". */
  onSubmit: (breedId: string | null) => void
}

/**
 * The hardest answer format: no choices, so the player types a breed name and picks it from the matches.
 * Matches show only names (no group, rarity or number) and nothing is listed until something is typed, so the
 * search itself gives no hint. Any of the 600+ Dogdex breeds can be chosen, not just the ones the quiz has photos for.
 */
export function BreedSearchAnswer({ onSubmit }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const inputId = useId()
  const trimmed = query.trim()
  const results = useMemo(() => searchBreeds(data.breeds, query, MAX_MATCHES), [query])

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (selected) onSubmit(selected)
      }}
    >
      <div className="field">
        <label htmlFor={inputId}>Which breed is this? Search for its name</label>
        <input
          id={inputId}
          className="input"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Start typing a breed…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {trimmed && (
        <>
          <p className="sr-only" role="status">
            {results.length === 0 ? 'No matches' : `${results.length} ${results.length === 1 ? 'match' : 'matches'}`}
          </p>
          <ul className="pick-list" aria-label="Matching breeds">
            {results.map((b) => (
              <li key={b.id}>
                <button type="button" className={`pick-item ${selected === b.id ? 'pick-item--on' : ''}`} aria-pressed={selected === b.id} onClick={() => setSelected(b.id)}>
                  <span>{b.name}</span>
                  {selected === b.id && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="pick-item muted">No breed matches “{trimmed}”.</li>}
          </ul>
        </>
      )}

      {selected && (
        <p>
          Your answer: <strong>{breedsById[selected].name}</strong>
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={!selected}>
        Check answer
      </button>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => onSubmit(null)}>
        I don’t know
      </button>
    </form>
  )
}
