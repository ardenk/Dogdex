import { createContext, useContext } from 'react'
import type { Settings, Snapshot } from '../domain/types'

export interface DataValue {
  snapshot: Snapshot
  settings: Settings
}

export const DataContext = createContext<DataValue | null>(null)

/** Live view of the user's records. Re-renders whenever anything in IndexedDB changes. */
export function useData(): DataValue {
  const v = useContext(DataContext)
  if (!v) throw new Error('useData must be used inside <DataProvider>')
  return v
}
