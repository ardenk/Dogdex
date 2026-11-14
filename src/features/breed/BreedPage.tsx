import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { DogRow } from '../../components/DogRow'
import { GroupSelect } from '../../components/GroupSelect'
import { RarityMark } from '../../components/RarityMark'
import { Silhouette } from '../../components/Silhouette'
import { useToast } from '../../components/toast-context'
import { breedsById, entryNumber, groupsById } from '../../data'
import { entryLabel } from '../../domain/format'
import { useData } from '../../storage/data-context'
import { repo } from '../../storage/localRepo'
import { usePhotoUrl } from '../../storage/usePhotoUrl'

export function BreedPage() {
  const { breedId = '' } = useParams()
  const breed = breedsById[breedId]
  const { snapshot } = useData()
  const [more, setMore] = useState(false)

  const dogs = snapshot.dogs.filter((d) => d.breedId === breedId).sort((a, b) => b.lastMetAt - a.lastMetAt)
  const encounterCount = (dogId: string) => snapshot.encounters.filter((e) => e.dogId === dogId).length
  const heroUrl = usePhotoUrl(dogs.find((d) => d.primaryPhotoId)?.primaryPhotoId, 'full')

  if (!breed) {
    return (
      <main className="page">
        <Link to="/dogdex" className="back-link">← Dogdex</Link>
        <p>That breed isn’t in the Dogdex.</p>
      </main>
    )
  }
  const group = groupsById[breed.groupId]

  return (
    <main className="page">
      <Link to="/dogdex" className="back-link">← Dogdex</Link>

      <div className="hero" style={dogs.length ? undefined : { background: 'transparent', borderStyle: 'dashed', boxShadow: 'none' }}>
        {heroUrl ? <img src={heroUrl} alt={`A ${breed.name} you met`} /> : <Silhouette variant={breed.groupId} />}
      </div>

      <header className="stack">
        <span className="eyebrow">
          {entryLabel(entryNumber[breed.id])} · {group.name}
        </span>
        <h1>{breed.name}</h1>
        <div className="row">
          <RarityMark rarity={breed.rarity} />
          <span className="muted small">{dogs.length ? `${dogs.length} met` : 'Not met yet'}</span>
        </div>
        <p>{breed.summary}</p>
      </header>

      <div className="stack">
        <button type="button" className="expander" aria-expanded={more} aria-controls="breed-more" onClick={() => setMore((v) => !v)}>
          <span>{more ? 'Show less' : 'Learn more'}</span>
          <span aria-hidden="true">{more ? '−' : '+'}</span>
        </button>
        {more && (
          <div id="breed-more" className="card stack stack--lg">
            <dl className="stack" style={{ margin: 0 }}>
              <div>
                <dt className="eyebrow">Group</dt>
                <dd style={{ margin: 0 }}>
                  {group.name}. <span className="muted">{group.blurb}</span>
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Origin</dt>
                <dd style={{ margin: 0 }}>{breed.origin}</dd>
              </div>
              <div>
                <dt className="eyebrow">Temperament</dt>
                <dd style={{ margin: 0 }}>{breed.temperament.join(', ')}</dd>
              </div>
            </dl>
            <div className="stack">
              <h2>Key identifying traits</h2>
              <ul className="trait-list">
                {breed.traits.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <section className="stack" aria-labelledby="met-heading">
        <h2 id="met-heading">Dogs you’ve met</h2>
        {dogs.length === 0 && <p className="muted">None yet.</p>}
        <div>
          {dogs.map((d) => (
            <DogRow key={d.id} dog={d} encounterCount={encounterCount(d.id)} />
          ))}
        </div>
        <Link to={`/log?breed=${breed.id}`} className="btn btn--primary btn--block">
          Log a {breed.name}
        </Link>
      </section>
    </main>
  )
}

export function CustomBreedPage() {
  const { label = '' } = useParams()
  const decoded = decodeURIComponent(label)
  const navigate = useNavigate()
  const toast = useToast()
  const { snapshot } = useData()
  const dogs = snapshot.dogs.filter((d) => !d.breedId && d.customBreedLabel === decoded).sort((a, b) => b.lastMetAt - a.lastMetAt)
  const currentGroup = dogs.find((d) => d.customGroupId)?.customGroupId ?? ''

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(decoded)
  const [groupId, setGroupId] = useState(currentGroup)

  const startEdit = () => {
    setName(decoded)
    setGroupId(currentGroup)
    setEditing(true)
  }

  const save = async () => {
    try {
      await repo.updateCustomBreed(decoded, { label: name, groupId: groupId || undefined })
      setEditing(false)
      toast('Breed updated')
      // The page's address contains the breed name, so move to the new one.
      navigate(`/dogdex/other/${encodeURIComponent(name.trim())}`, { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that change.')
    }
  }

  return (
    <main className="page">
      <Link to="/dogdex" className="back-link">← Dogdex</Link>
      <header className="stack">
        <span className="eyebrow">
          {currentGroup && groupsById[currentGroup] ? `Added by you · ${groupsById[currentGroup].name}` : 'Other breed'}
        </span>
        <h1>{decoded}</h1>
        {dogs.length === 0 && <p className="muted">No dogs logged under this breed.</p>}
      </header>

      {dogs.length > 0 && (
        <button type="button" className="btn btn--block" onClick={editing ? () => setEditing(false) : startEdit} aria-expanded={editing}>
          {editing ? 'Cancel' : 'Edit name and category'}
        </button>
      )}

      {editing && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="field">
            <label htmlFor="cb-name">Breed name</label>
            <input id="cb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" />
          </div>
          <GroupSelect
            value={groupId}
            onChange={setGroupId}
            hint={`Applies to ${dogs.length} ${dogs.length === 1 ? 'dog' : 'dogs'}. It appears in that category's section of the Dogdex.`}
          />
          <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
            Save changes
          </button>
        </form>
      )}

      <div>
        {dogs.map((d) => (
          <DogRow key={d.id} dog={d} />
        ))}
      </div>
    </main>
  )
}
