// Supabase Edge Function: GIPHY sticker proxy. Entry point; the logic is in logic.ts.
// Needs one secret, set in the dashboard under Edge Functions → Secrets: GIPHY_API_KEY_DOGDEX
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle } from './logic.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve((req) =>
  handle(req, {
    apiKey: Deno.env.get('GIPHY_API_KEY_DOGDEX'),
    fetchImpl: fetch,
    now: () => Date.now(),
    async getUserId(authHeader) {
      if (!authHeader) return null
      // Ask Supabase Auth who this token belongs to. The anon/publishable key is not a user, so it yields null.
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await client.auth.getUser()
      return error ? null : (data.user?.id ?? null)
    },
  }),
)
