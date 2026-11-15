import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useToast } from '../../components/toast-context'
import { breedsById, data } from '../../data'
import { customBreedsNowListed } from '../../domain/customBreeds'
import { groupTiles, indexDogs, searchTiles, uncategorizedTiles } from '../../domain/dogdexTiles'
import { resolveBreedId } from '../../services/identify'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'
import { BreedTileCard } from './BreedTileCard'
import { DogdexSearch } from './DogdexSearch'

/** How many cards a category shows on the Dogdex page: one row of the three-column grid. */
const PREVIEW = 3

export function DogdexPage() {
  const { snapshot } = useData()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [filter, setFilter] = useState<'all' | 'logged'>('all')
  const [dismissed, setDismissed] = useState<string[]>([])

  const index = useMemo(() => indexDogs(snapshot.dogs), [snapshot.dogs])
  const setQuery = (q: string) => setParams(q ? { q } : {}, { replace: true })

  /** Typed-in breeds that are now real entries: offered a one-tap move, never moved automatically. */
  const nowListed = useMemo(
    () => customBreedsNowListed(snapshot.dogs, resolveBreedId).filter((n) => !dismissed.includes(n.label)),
    [snapshot.dogs, dismissed],
  )
  const moveToListed = async (n: (typeof nowListed)[number]) => {
    try {
      for (const id of n.dogIds) await repo.updateDogBreed(id, { breedId: n.breedId })
      toast(`Moved ${n.dogIds.length === 1 ? '1 dog' : `${n.dogIds.length} dogs`} to ${breedsById[n.breedId].name}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not move those dogs.')
    }
  }

  const totalLogged = data.breeds.filter((b) => index.byBreed.has(b.id)).length
  const searching = query.trim().length > 0
  const results = useMemo(() => (searching ? searchTiles(data.breeds, index, query) : []), [searching, index, query])
  const shownResults = filter === 'logged' ? results.filter((t) => t.count > 0) : results
  const other = useMemo(() => uncategorizedTiles(index, data.groups.map((g) => g.id)), [index])

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">
            {totalLogged} of {data.breeds.length} breeds
          </span>
          <h1>Dogdex</h1>
        </div>
        <div className="segmented" role="group" aria-label="Filter breeds">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          <button type="button" aria-pressed={filter === 'logged'} onClick={() => setFilter('logged')}>
            Met
          </button>
        </div>
      </header>

      <DogdexSearch value={query} onChange={setQuery} />

      {nowListed.map((n) => (
        <section key={n.label} className="card stack" aria-label={`${n.label} is now listed`}>
          <p>
            <strong>{n.label}</strong> {n.label.toLowerCase() === breedsById[n.breedId].name.toLowerCase() ? 'is now a listed breed' : `is now in the Dogdex as ${breedsById[n.breedId].name}`}. Move{' '}
            {n.dogIds.length === 1 ? 'your dog' : `your ${n.dogIds.length} dogs`} there so {n.dogIds.length === 1 ? 'it counts' : 'they count'} toward your collection?
          </p>
          <div className="row">
            <button type="button" className="btn btn--small" onClick={() => moveToListed(n)}>
              Move
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setDismissed((d) => [...d, n.label])}>
              Not now
            </button>
          </div>
        </section>
      ))}

      {searching ? (
        <section aria-label="Search results">
          <p className="muted small" role="status">
            {shownResults.length === 0 ? `No breed matches “${query.trim()}”.` : `${shownResults.length} ${shownResults.length === 1 ? 'match' : 'matches'}`}
          </p>
          {shownResults.length > 0 && (
            <ul className="breed-grid">
              {shownResults.map((t) => (
                <li key={t.key}>
                  <BreedTileCard tile={t} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {data.groups.map((group) => {
            const all = groupTiles(data.breeds, group.id, index)
            const listedTotal = data.breeds.filter((b) => b.groupId === group.id).length
            const metCount = data.breeds.filter((b) => b.groupId === group.id && index.byBreed.has(b.id)).length
            const tiles = filter === 'logged' ? all.filter((t) => t.count > 0) : all
            if (tiles.length === 0) return null
            const more = tiles.length - PREVIEW
            return (
              <section key={group.id} className="group" aria-labelledby={`group-${group.id}`}>
                <Link
                  to={`/dogdex/group/${group.id}`}
                  className="group-head"
                  aria-label={`${group.name}, ${metCount} of ${listedTotal} met. See all ${group.name} breeds`}
                >
                  <h2 id={`group-${group.id}`}>{group.name}</h2>
                  <span className="mono small group-head__meta">
                    {metCount}/{listedTotal}
                    {metCount === listedTotal && group.id !== 'mixed' ? ' ✓' : ''}
                    <span className="group-head__chevron" aria-hidden="true" />
                  </span>
                </Link>
                <ul className="breed-grid">
                  {tiles.slice(0, PREVIEW).map((t) => (
                    <li key={t.key}>
                      <BreedTileCard tile={t} />
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <Link to={`/dogdex/group/${group.id}`} className="group-more" aria-hidden="true" tabIndex={-1}>
                    See all {tiles.length} →
                  </Link>
                )}
              </section>
            )
          })}

          {other.length > 0 && (
            <section aria-labelledby="group-other">
              <div className="group-head group-head--static">
                <h2 id="group-other">Other breeds</h2>
              </div>
              <ul className="stack">
                {other.map((t) => (
                  <li key={t.key}>
                    <Link to={t.href} className="dog-row">
                      <span className="grow dog-row__title">{t.name}</span>
                      <span className="mono small">{t.count} met</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {filter === 'logged' && totalLogged === 0 && index.byLabel.size === 0 && (
            <div className="card">
              <p>No dogs yet. Tap the + button to log your first one.</p>
            </div>
          )}
        </>
      )}
    </main>
  )
}
