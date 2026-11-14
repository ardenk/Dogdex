import { createContext, useContext } from 'react'

export const ToastContext = createContext<(message: string) => void>(() => {})

/** Show a short, polite message (announced to screen readers). */
export const useToast = () => useContext(ToastContext)
