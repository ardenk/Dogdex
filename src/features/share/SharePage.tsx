import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '../../components/toast-context'
import { breedsById, entryNumber, groupsById, raritiesById } from '../../data'
import { breedName, dogGroupId, dogTitle, entryLabel } from '../../domain/format'
import { renderShareCard } from '../../services/share/card'
import { useData } from '../../storage/data-context'
import { db } from '../../storage/db'

export function SharePage() {
  const { dogId = '' } = useParams()
  const { snapshot } = useData()
  const toast = useToast()
  const dog = snapshot.dogs.find((d) => d.id === dogId)
  const encounters = snapshot.encounters.filter((e) => e.dogId === dogId).sort((a, b) => b.metAt - a.metAt)
  const photo = useLiveQuery(() => (dog?.primaryPhotoId ? db.photos.get(dog.primaryPhotoId) : undefined), [dog?.primaryPhotoId])
  const [includePlace, setIncludePlace] = useState(false) // private by default
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)

  const breed = dog?.breedId ? breedsById[dog.breedId] : undefined
  const place = encounters.find((e) => e.placeLabel)?.placeLabel
  const photoBlob = photo?.blob
  const photoPending = !!dog?.primaryPhotoId && photo === undefined

  useEffect(() => {
    if (!dog || photoPending) return
    let cancelled = false
    let url: string | undefined
    const tier = breed ? raritiesById[breed.rarity] : undefined
    renderShareCard({
      title: dog.name ?? breedName(dog),
      breedName: dog.name ? breedName(dog) : dog.breedId || dog.customGroupId ? `${groupsById[dogGroupId(dog) ?? '']?.name ?? 'Other'} group` : 'Breed not listed',
      groupId: dogGroupId(dog) ?? 'mixed',
      rarityLabel: tier?.label ?? 'Other breed',
      rarityGlyph: tier?.glyph ?? '●',
      rarityId: tier?.id ?? 'common',
      entryLabel: breed ? entryLabel(entryNumber[breed.id]) : 'Dogdex',
      photo: photoBlob,
      metAt: dog.lastMetAt,
      place: includePlace ? place : undefined,
    })
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setCard({ blob, url })
        setFailed(false)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [dog, breed, photoBlob, photoPending, includePlace, place])

  if (!dog) {
    return (
      <main className="page">
        <Link to="/" className="back-link">← Home</Link>
        <p>That dog isn’t here anymore.</p>
      </main>
    )
  }

  const fileName = `dogdex-${(dog.name ?? breedName(dog)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
  const file = card ? new File([card.blob], fileName, { type: 'image/png' }) : null
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: dogTitle(dog), text: `${dogTitle(dog)}, a ${breedName(dog)}, on Dogdex` })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // user closed the share sheet
      toast('Sharing is not available here. Use Save image instead.')
    }
  }

  const download = () => {
    if (!card) return
    const a = document.createElement('a')
    a.href = card.url
    a.download = fileName
    a.click()
  }

  return (
    <main className="page">
      <Link to={`/dog/${dog.id}`} className="back-link">← {dogTitle(dog)}</Link>
      <h1>Share card</h1>

      {card && !failed ? (
        <img
          src={card.url}
          alt={`Share card for ${dogTitle(dog)}, a ${breedName(dog)}${breed ? `, ${raritiesById[breed.rarity]?.label.toLowerCase()} breed` : ''}`}
          style={{ width: '100%', border: 'var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}
        />
      ) : (
        <p className="muted" aria-live="polite">{failed ? 'Could not draw the card.' : 'Drawing your card…'}</p>
      )}

      {place && (
        <label className="row card card--flat" style={{ minHeight: 'var(--tap)' }}>
          <input type="checkbox" checked={includePlace} onChange={(e) => setIncludePlace(e.target.checked)} style={{ width: 24, height: 24 }} />
          <span>
            Include neighborhood ({place})
            <br />
            <span className="muted small">Left off by default to protect privacy.</span>
          </span>
        </label>
      )}

      <div className="stack">
        {canShare && (
          <button type="button" className="btn btn--primary btn--big btn--block" onClick={share}>
            Share
          </button>
        )}
        <button type="button" className={`btn btn--block ${canShare ? '' : 'btn--primary btn--big'}`} onClick={download} disabled={!card}>
          Save image
        </button>
      </div>
    </main>
  )
}
