import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { GiphyError, giphyEnabled, searchStickers, trendingStickers } from '../services/giphy'
import type { GiphySticker } from '../services/giphy'
import { useAuth } from '../sync/auth-context'

interface Props {
  onPick: (sticker: GiphySticker) => void
  onClose: () => void
}

export function StickerPicker({ onPick, onClose }: Props) {
  const { user } = useAuth()
  const canSearch = giphyEnabled && !!user
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GiphySticker[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const load = async (q: string, offset: number) => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setLoading(true)
    setError(null)
    try {
      const page = q.trim() ? await searchStickers(q, offset, c.signal) : await trendingStickers(offset, c.signal)
      setResults((prev) => (offset === 0 ? page.stickers : [...prev, ...page.stickers]))
      setNextOffset(page.nextOffset)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof GiphyError ? e.message : 'Something went wrong loading stickers.')
      if (offset === 0) setResults([])
      setNextOffset(null)
    } finally {
      if (controller.current === c) setLoading(false)
    }
  }

  // Trending when the box is empty; otherwise search shortly after typing stops.
  useEffect(() => {
    if (!canSearch) return
    const t = window.setTimeout(() => void load(query, 0), query ? 350 : 0)
    return () => window.clearTimeout(t)
  }, [query, canSearch])

  useEffect(() => () => controller.current?.abort(), [])

  return (
    <div className="overlay overlay--sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sticker-title">
        <div className="row row--between">
          <h2 id="sticker-title">Add a sticker</h2>
          <button type="button" className="btn btn--small" onClick={onClose}>
            Close
          </button>
        </div>

        {!giphyEnabled ? (
          <div className="card card--flat stack">
            <p>Stickers aren’t set up yet.</p>
            <p className="muted small">They need the cloud connection (Supabase) to be configured in this build.</p>
          </div>
        ) : !user ? (
          <div className="card card--flat stack">
            <p>Sign in to add stickers.</p>
            <p className="muted small">Sticker search runs through your account, which keeps the sticker service private and fair for everyone. Your dogs stay on this device either way.</p>
            <Link to="/you" className="btn btn--primary" onClick={onClose}>
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="sticker-search">Search GIPHY stickers</label>
              <input
                id="sticker-search"
                ref={searchRef}
                className="input"
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Try “happy dog”, “party”, “wow”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <p className="muted small">
              {query.trim() ? 'Results for your search' : 'Trending now'}. Searching shares your search words with GIPHY, and GIPHY sees your IP address when the stickers load.
            </p>

            {error && (
              <p role="alert" className="small">
                {error}
              </p>
            )}
            {!error && !loading && results.length === 0 && <p className="muted">No stickers found. Try different words.</p>}

            <ul className="sticker-grid" aria-label="Sticker results" aria-busy={loading}>
              {results.map((s) => (
                <li key={s.giphyId}>
                  <button type="button" className="sticker-pick" onClick={() => onPick(s)} aria-label={`Add sticker: ${s.title}`}>
                    <picture>
                      {s.stillUrl && <source media="(prefers-reduced-motion: reduce)" srcSet={s.stillUrl} />}
                      <img src={s.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    </picture>
                  </button>
                </li>
              ))}
            </ul>
            {loading && <p className="muted small" aria-live="polite">Loading…</p>}
            {nextOffset !== null && !loading && (
              <button type="button" className="btn btn--block" onClick={() => void load(query, nextOffset)}>
                Load more
              </button>
            )}
            <p className="small mono">
              <a href="https://giphy.com" target="_blank" rel="noopener noreferrer">
                Powered by GIPHY
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
