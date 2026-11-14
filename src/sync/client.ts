import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * True when the page was opened from a password-reset email link. Supabase puts `type=recovery` in the address
 * and removes it once it has read the tokens, so note it now, before the client below starts reading and clearing the address (and so the auth listener can't miss the event).
 */
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /[#&?]type=recovery\b/.test(`${window.location.hash}${window.location.search}`)

/**
 * The Supabase client, or null when the env vars are missing: Dogdex then runs local-only,
 * exactly as it did before sign-in existed.
 */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

export const cloudEnabled = supabase !== null
