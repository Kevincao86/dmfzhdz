/**
 * 登录后从 Supabase 恢复各平台商家绑定到本机 localStorage（避免设置页未打开时显示「尚未绑定」）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hydrateDouyinBindingsFromCloud } from './merchantDouyinCloudBinding'
import { hydrateKuaishouBindingsFromCloud } from './merchantKuaishouCloudBinding'

export async function hydratePlatformBindingsFromCloud(
  supabase: SupabaseClient,
): Promise<void> {
  try {
    await Promise.all([
      hydrateDouyinBindingsFromCloud(supabase),
      hydrateKuaishouBindingsFromCloud(supabase),
    ])
  } catch {
    /* 云端恢复失败时保留本机凭证，设置页会重试 */
  }
}
