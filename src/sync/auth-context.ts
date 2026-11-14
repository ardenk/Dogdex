import { createContext, useContext } from 'react'

export interface AuthValue {
  /** False when the Supabase env vars are missing (local-only mode). */
  enabled: boolean
  loading: boolean
  user: { id: string; email?: string } | null
  status: 'idle' | 'syncing' | 'error'
  lastSyncedAt: number | null
  error: string | null
  /** This device holds another account's data; the user must choose before anything syncs. */
  needsAccountChoice: boolean
  /** The user arrived from a password-reset email and must choose a new password. */
  recovering: boolean
  /** Resolve to an error message, or null on success. */
  signIn(email: string, password: string): Promise<string | null>
  signUp(email: string, password: string): Promise<{ error?: string; needsConfirmation?: boolean }>
  /** Emails a reset link. Resolves to an error message, or null (also null for unknown emails, so accounts can't be probed). */
  requestPasswordReset(email: string): Promise<string | null>
  /** Sets a new password for the signed-in (or recovering) user. Resolves to an error message, or null on success. */
  updatePassword(password: string): Promise<string | null>
  /** Leave the reset screen without changing the password. */
  cancelRecovery(): void
  /**
   * Backs up one last time, then removes this account's collection from the device and signs out.
   * Returns 'unsynced' (and does nothing) if the backup failed and `force` wasn't set.
   */
  signOut(opts?: { force?: boolean }): Promise<'done' | 'unsynced'>
  syncNow(): Promise<void>
  /** Discard this device's data and load the signed-in account's data instead. */
  replaceDeviceData(): Promise<void>
  /** Delete everything on this device and, if signed in, everything in the cloud. */
  wipeAll(): Promise<void>
}

const unavailable = async () => {
  throw new Error('Cloud sync is not configured')
}

export const AuthContext = createContext<AuthValue>({
  enabled: false,
  loading: false,
  user: null,
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  needsAccountChoice: false,
  recovering: false,
  signIn: unavailable,
  signUp: unavailable,
  requestPasswordReset: async () => 'Cloud sync is not configured',
  updatePassword: async () => 'Cloud sync is not configured',
  cancelRecovery: () => {},
  signOut: async () => 'done',
  syncNow: async () => {},
  replaceDeviceData: async () => {},
  wipeAll: async () => {},
})

export const useAuth = () => useContext(AuthContext)
