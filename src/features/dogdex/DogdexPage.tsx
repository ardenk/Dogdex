import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PhotoStack } from '../../components/PhotoStack'
import { RarityMark } from '../../components/RarityMark'
import { Silhouette } from '../../components/Silhouette'
import { breedsInGroup, data, entryNumber, groupsById } from '../../data'
import { entryLabel } from '../../domain/format'
import { stackPhotoIds } from '../../domain/photos'
import { useData } from '../../storage/data-context'

export function DogdexPage() {
  const { snapshot } = useData()
  const [filter, setFilter] = useState<'all' | 'logged'>('all')

  const dogCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of snapshot.dogs) if (d.breedId) m.set(d.breedId, (m.get(d.breedId) ?? 0) + 1)
    return m
  }, [snapshot.dogs])

  /** Photos to stack on each breed's tile, newest dog on top. Keyed by breed id. */
  const photosByBreed = useMemo(() => {
    const byBreed = new Map<string, typeof snapshot.dogs>()
    for (const d of snapshot.dogs) if (d.breedId) byBreed.set(d.breedId, [...(byBreed.get(d.breedId) ?? []), d])
    return new Map([...byBreed].map(([id, dogs]) => [id, stackPhotoIds(dogs)]))
  }, [snapshot])

  /** Breeds typed in by the user, each filed under a group or left in "Other breeds". */
  const custom = useMemo(() => {
    const m = new Map<string, { label: string; count: number; groupId?: string; dogs: typeof snapshot.dogs }>()
    for (const d of snapshot.dogs) {
      if (d.breedId || !d.customBreedLabel) continue
      const cur = m.get(d.customBreedLabel) ?? { label: d.customBreedLabel, count: 0, dogs: [] }
      cur.count += 1
      cur.dogs.push(d)
      cur.groupId ??= d.customGroupId
      m.set(d.customBreedLabel, cur)
    }
    return [...m.values()].map((c) => ({ ...c, photoIds: stackPhotoIds(c.dogs) })).sort((a, b) => a.label.localeCompare(b.label))
  }, [snapshot.dogs])
  const customIn = (groupId: string) => custom.filter((c) => c.groupId === groupId)
  const ungrouped = custom.filter((c) => !c.groupId || !groupsById[c.groupId])

  const totalLogged = data.breeds.filter((b) => dogCount.has(b.id)).length

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

      {data.groups.map((group) => {
        const breeds = breedsInGroup(group.id)
        const metCount = breeds.filter((b) => dogCount.has(b.id)).length
        const shown = filter === 'logged' ? breeds.filter((b) => dogCount.has(b.id)) : breeds
        const extra = customIn(group.id)
        if (shown.length === 0 && extra.length === 0) return null
        return (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <div className="group-head">
              <h2 id={`group-${group.id}`}>{group.name}</h2>
              <span className="mono small" aria-label={`${metCount} of ${breeds.length} met`}>
                {metCount}/{breeds.length}
                {metCount === breeds.length && group.id !== 'mixed' ? ' ✓' : ''}
              </span>
            </div>
            <ul className="breed-grid">
              {shown.map((b) => {
                const n = dogCount.get(b.id) ?? 0
                const photos = photosByBreed.get(b.id) ?? []
                return (
                  <li key={b.id}>
                    <Link
                      to={`/dogdex/breed/${b.id}`}
                      className={`breed-card ${n ? 'breed-card--logged' : ''}`}
                      aria-label={`${b.name}, ${entryLabel(entryNumber[b.id])}, ${n ? `${n} met` : 'not met yet'}`}
                    >
                      {n > 0 && <span className="breed-card__count" aria-hidden="true">{n}</span>}
                      <span className="breed-card__art">
                        {photos.length > 0 ? <PhotoStack photoIds={photos} /> : <Silhouette variant={group.id} />}
                      </span>
                      <span className="breed-card__no" aria-hidden="true">{entryLabel(entryNumber[b.id])}</span>
                      <span className="breed-card__name" aria-hidden="true">{b.name}</span>
                      <span aria-hidden="true"><RarityMark rarity={b.rarity} /></span>
                    </Link>
                  </li>
                )
              })}
              {extra.map((c) => (
                <li key={`custom-${c.label}`}>
                  <Link
                    to={`/dogdex/other/${encodeURIComponent(c.label)}`}
                    className="breed-card breed-card--logged"
                    aria-label={`${c.label}, custom breed, ${c.count} met`}
                  >
                    <span className="breed-card__count" aria-hidden="true">{c.count}</span>
                    <span className="breed-card__art">
                      {c.photoIds.length > 0 ? <PhotoStack photoIds={c.photoIds} /> : <Silhouette variant={group.id} />}
                    </span>
                    <span className="breed-card__no" aria-hidden="true">Added by you</span>
                    <span className="breed-card__name" aria-hidden="true">{c.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {ungrouped.length > 0 && (
        <section aria-labelledby="group-other">
          <div className="group-head">
            <h2 id="group-other">Other breeds</h2>
          </div>
          <ul className="stack">
            {ungrouped.map((c) => (
              <li key={c.label}>
                <Link to={`/dogdex/other/${encodeURIComponent(c.label)}`} className="dog-row">
                  <span className="grow dog-row__title">{c.label}</span>
                  <span className="mono small">{c.count} met</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filter === 'logged' && totalLogged === 0 && custom.length === 0 && (
        <div className="card">
          <p>No dogs yet. Tap the + button to log your first one.</p>
        </div>
      )}
    </main>
  )
}
