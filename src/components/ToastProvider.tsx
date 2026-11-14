import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext } from './toast-context'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    setMessage({ text, key: Date.now() })
    timer.current = window.setTimeout(() => setMessage(null), 3500)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <div className="toast" key={message.key}>
            {message.text}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
