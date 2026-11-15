// Supabase Edge Function: breed identification via Google Cloud Vision. Entry point; the logic is in logic.ts.
// Needs one secret, set in the dashboard under Edge Functions → Secrets: GOOGLE_VISION_API_KEY
// (SUPABASE_SERVICE_ROLE_KEY is provided to every function automatically; it is used only for the daily counter.)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle } from './logic.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
/** Photos each user may identify per day. Bounds the Cloud Vision bill. */
const DAILY_LIMIT = 30

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

Deno.serve((req) =>
  handle(req, {
    apiKey: Deno.env.get('GOOGLE_VISION_API_KEY'),
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
    async takeDailySlot(userId) {
      // take_identify_slot (see the identify_usage migration) counts today's uses and says whether this one is allowed.
      const { data, error } = await admin.rpc('take_identify_slot', { p_user: userId, p_limit: DAILY_LIMIT })
      return !error && data === true
    },
  }),
)
