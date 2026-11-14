import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { DEFAULT_SETTINGS } from '../domain/types'
import { DataContext } from './data-context'
import { repo } from './localRepo'

export function DataProvider({ children }: { children: ReactNode }) {
  const snapshot = useLiveQuery(() => repo.getSnapshot(), [])
  const settings = useLiveQuery(() => repo.getSettings(), [])
  if (!snapshot) return <p className="page muted">Loading your Dogdex…</p>
  return <DataContext.Provider value={{ snapshot, settings: settings ?? DEFAULT_SETTINGS }}>{children}</DataContext.Provider>
}
