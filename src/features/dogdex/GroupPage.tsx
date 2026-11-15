import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { data, groupsById } from '../../data'
import { groupTiles, indexDogs, searchTiles } from '../../domain/dogdexTiles'
import { useData } from '../../storage/data-context'
import { BreedTileCard } from './BreedTileCard'
import { DogdexSearch } from './DogdexSearch'

/** Every breed in one category, the ones you have logged first. Reached by tapping a category on the Dogdex page. */
export function GroupPage() {
  const { groupId = '' } = useParams()
  const group = groupsById[groupId]
  const { snapshot } = useData()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const index = useMemo(() => indexDogs(snapshot.dogs), [snapshot.dogs])

  const all = useMemo(() => (group ? groupTiles(data.breeds, group.id, index) : []), [group, index])
  const searching = query.trim().length > 0
  const tiles = useMemo(() => (searching && group ? searchTiles(data.breeds, index, query, { groupId: group.id }) : all), [searching, group, index, query, all])

  if (!group) {
    return (
      <main className="page">
        <Link to="/dogdex" className="back-link">← Dogdex</Link>
        <p>That category isn’t in the Dogdex.</p>
      </main>
    )
  }
  const listed = data.breeds.filter((b) => b.groupId === group.id)
  const met = listed.filter((b) => index.byBreed.has(b.id)).length

  return (
    <main className="page">
      <Link to="/dogdex" className="back-link">← Dogdex</Link>
      <header className="stack">
        <span className="eyebrow">
          {met} of {listed.length} met
        </span>
        <h1>{group.name}</h1>
        <p className="muted">{group.blurb}</p>
      </header>

      <DogdexSearch value={query} onChange={(q) => setParams(q ? { q } : {}, { replace: true })} label={`Search ${group.name} breeds`} />

      <section aria-label={searching ? 'Search results' : `All ${group.name} breeds`}>
        {searching && (
          <p className="muted small" role="status">
            {tiles.length === 0 ? `No ${group.name} breed matches “${query.trim()}”.` : `${tiles.length} ${tiles.length === 1 ? 'match' : 'matches'}`}
          </p>
        )}
        <ul className="breed-grid">
          {tiles.map((t) => (
            <li key={t.key}>
              <BreedTileCard tile={t} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
