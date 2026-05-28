import type { RegistrySnapshot } from './opsRegistryTypes.js'

export type MpTalentInboxEntryInput = {
  talentMemberId: string
  title: string
  body: string
  category?: 'order' | 'business' | 'system'
  mpOrderId?: string
}

export function appendMpTalentInboxInSnapshot(
  data: RegistrySnapshot,
  entries: MpTalentInboxEntryInput[],
): { ok: true; count: number } | { ok: false; error: string; status: number } {
  const rows = Array.isArray(entries) ? entries : []
  if (!rows.length) return { ok: false, error: 'empty_entries', status: 400 }
  const list = [...(data.mpTalentInbox ?? [])]
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  let added = 0
  for (const row of rows) {
    const talentMemberId = String(row.talentMemberId || '').trim()
    const title = String(row.title || '').trim()
    const body = String(row.body || '').trim()
    if (!talentMemberId || !title) continue
    list.unshift({
      id: `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      talentMemberId,
      title,
      body: body || title,
      category:
        row.category === 'order' || row.category === 'system' ? row.category : 'business',
      mpOrderId: row.mpOrderId ? String(row.mpOrderId).trim() : undefined,
      createdAt: now,
      read: false,
    })
    added += 1
  }
  if (!added) return { ok: false, error: 'invalid_entries', status: 400 }
  data.mpTalentInbox = list.slice(0, 5000)
  return { ok: true, count: added }
}
