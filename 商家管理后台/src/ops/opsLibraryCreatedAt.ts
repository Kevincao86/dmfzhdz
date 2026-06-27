import type { RegistryMpTalentMember } from './opsRegistryApi'

export function resolveLibraryAccountCreatedAt(
  entry: { createdAt?: string; updatedAt?: string },
  member?: RegistryMpTalentMember | null,
): string {
  const raw = String(entry.createdAt || member?.registeredAt || '').trim()
  return raw || '—'
}

export function formatAvgQuoteYuan(yuan: number | null | undefined): string {
  if (yuan == null || !Number.isFinite(yuan) || yuan <= 0) return '—'
  return `¥${Math.round(yuan).toLocaleString('zh-CN')}`
}
