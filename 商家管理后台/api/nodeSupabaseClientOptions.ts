import type { SupabaseClientOptions } from '@supabase/supabase-js'
import ws from 'ws'

/** ECS auth-api / Node 20：supabase-js Realtime 须 ws transport，否则 createClient 抛错 */
export function nodeSupabaseClientOptions(): SupabaseClientOptions<'public'> {
  return {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  }
}
