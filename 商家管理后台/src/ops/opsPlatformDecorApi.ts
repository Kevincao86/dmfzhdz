import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { requireOpsModuleEdit } from './opsStaffAuth'
import type { RegistryPlatformDecoration } from '../meooRegistryShared/platformDecorTypes.js'

export async function savePlatformDecoration(
  decoration: RegistryPlatformDecoration,
): Promise<{ ok: true; itemCount?: number } | { ok: false; error: string }> {
  const denied = requireOpsModuleEdit('platform_decor')
  if (denied) return { ok: false, error: denied }
  const res = await fetchOpsErpApi('/api/meoo-ops-platform-decor-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decoration }),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    return { ok: false, error: String(data.error ?? data.detail ?? 'save_failed') }
  }
  return { ok: true, itemCount: Number(data.itemCount) || 0 }
}
