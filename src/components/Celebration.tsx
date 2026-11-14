import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { BadgeDef } from '../data'

interface Props {
  /** Headline, e.g. "A rare find!" */
  title: string
  /** Breed name or other detail line. */
  subtitle?: string
  glyph: string
  badges: BadgeDef[]
  viewHref?: string
  onClose: () => void
}

export function Celebration({ title, subtitle, glyph, badges, viewHref, onClose }: Props) {
  const done = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    done.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay">
      <div className="card celebration" role="alertdialog" aria-modal="true" aria-labelledby="celebration-title">
        <div className="stamp" aria-hidden="true">
          {glyph}
        </div>
        <div>
          <h2 id="celebration-title">{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {badges.length > 0 && (
          <div className="stack" style={{ width: '100%' }}>
            <span className="eyebrow">New badge{badges.length > 1 ? 's' : ''}</span>
            {badges.map((b) => (
              <div key={b.id} className="card card--flat row" style={{ padding: 10 }}>
                <span className="badge badge--earned" style={{ padding: 0, border: 0, boxShadow: 'none', background: 'none' }}>
                  <span className="badge__seal" aria-hidden="true">
                    {b.glyph}
                  </span>
                </span>
                <span style={{ textAlign: 'left' }}>
                  <strong>{b.name}</strong>
                  <br />
                  <span className="muted small">{b.description}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ width: '100%' }}>
          {viewHref && (
            <Link to={viewHref} className="btn grow" replace>
              View
            </Link>
          )}
          <button ref={done} type="button" className="btn btn--primary grow" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
