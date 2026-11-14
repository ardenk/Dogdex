import { useId, useMemo, useState } from 'react'
import { breedsById, data } from '../data'
import { searchBreeds } from '../domain/search'
import { RarityMark } from './RarityMark'

export type BreedSelection = { breedId: string; customLabel?: undefined } | { breedId?: undefined; customLabel: string }

interface Props {
  onSelect: (selection: BreedSelection) => void
  /** Recently or frequently logged breed ids, shown as one-tap chips. */
  recentBreedIds?: string[]
  /** Allow typing a breed that isn't in the dataset. */
  allowCustom?: boolean
  label?: string
  autoFocus?: boolean
}

export function BreedPicker({ onSelect, recentBreedIds = [], allowCustom = true, label = 'Search breeds', autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const results = useMemo(() => searchBreeds(data.breeds, query), [query])
  const trimmed = query.trim()

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          className="input"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="words"
          autoFocus={autoFocus}
          placeholder="Try “lab”, “frenchie”, “doodle”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!trimmed && recentBreedIds.length > 0 && (
        <div className="stack">
          <span className="eyebrow">Recent</span>
          <div className="chip-row">
            {recentBreedIds.map((id) => (
              <button key={id} type="button" className="chip" onClick={() => onSelect({ breedId: id })}>
                {breedsById[id]?.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {trimmed ? (
        <ul className="pick-list" aria-label="Matching breeds">
          {results.map((b) => (
            <li key={b.id}>
              <button type="button" className="pick-item" onClick={() => onSelect({ breedId: b.id })}>
                <span>{b.name}</span>
                <RarityMark rarity={b.rarity} />
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="pick-item muted">No match in the Dogdex yet.</li>}
          {allowCustom && (
            <li>
              <button type="button" className="pick-item" onClick={() => onSelect({ customLabel: trimmed })}>
                <span>
                  Not listed: use “<strong>{trimmed}</strong>”
                </span>
              </button>
            </li>
          )}
        </ul>
      ) : (
        <div className="pick-list">
          {data.groups.map((g) => (
            <section key={g.id} aria-label={g.name}>
              <div className="pick-group" aria-hidden="true">
                {g.name}
              </div>
              <ul>
                {data.breeds
                  .filter((b) => b.groupId === g.id)
                  .map((b) => (
                    <li key={b.id}>
                      <button type="button" className="pick-item" onClick={() => onSelect({ breedId: b.id })}>
                        <span>{b.name}</span>
                        <RarityMark rarity={b.rarity} />
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
