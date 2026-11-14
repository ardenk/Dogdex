import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemoteRow, RemoteStore } from './engine'

const BUCKET = 'dog-photos'

/** The real backend: Supabase tables for records, a private Storage bucket for photos. */
export function supabaseStore(client: SupabaseClient, userId: string): RemoteStore {
  return {
    async upsert(table, rows, onConflict) {
      const { error } = await client.from(table).upsert(rows, { onConflict })
      if (error) throw new Error(`Saving ${table} failed: ${error.message}`)
    },

    async fetchSince(table, cursor, limit) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('user_id', userId) // RLS already restricts this; stating it keeps the query index-friendly
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (error) throw new Error(`Loading ${table} failed: ${error.message}`)
      return (data ?? []) as RemoteRow[]
    },

    async uploadPhoto(path, blob) {
      const { error } = await client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
      if (error) throw new Error(`Uploading a photo failed: ${error.message}`)
    },

    async removePhotos(paths) {
      if (paths.length === 0) return
      const { error } = await client.storage.from(BUCKET).remove(paths)
      if (error) throw new Error(`Deleting a photo failed: ${error.message}`)
    },

    async downloadPhoto(path) {
      const { data, error } = await client.storage.from(BUCKET).download(path)
      if (error || !data) throw new Error(`Downloading a photo failed: ${error?.message ?? 'no data'}`)
      return data
    },
  }
}

/** Permanently removes this account's records and photo files from the cloud. Local data is untouched. */
export async function deleteCloudData(client: SupabaseClient, userId: string): Promise<void> {
  // Deleting dogs cascades to encounters, photos and guesses.
  for (const table of ['dogs', 'badge_awards', 'settings']) {
    const { error } = await client.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(`Deleting ${table} failed: ${error.message}`)
  }
  for (;;) {
    const { data, error } = await client.storage.from(BUCKET).list(userId, { limit: 100 })
    if (error) throw new Error(`Listing photos failed: ${error.message}`)
    if (!data || data.length === 0) break
    const { error: rmError } = await client.storage.from(BUCKET).remove(data.map((f) => `${userId}/${f.name}`))
    if (rmError) throw new Error(`Deleting photos failed: ${rmError.message}`)
  }
}
