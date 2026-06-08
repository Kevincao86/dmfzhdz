import type { RegistrySnapshot } from './opsRegistryTypes.js'

export type MpTalentInboxEntryInput = {
  talentMemberId: string
  title: string
  body: string
  category?: 'order' | 'business' | 'system'
  mpOrderId?: string
  contact?: string
  platformAccount?: string
  applicantId?: string
  /** 客户端勿传大图 base64；入选通知请留空，由服务端从招募单 groupQrImage 读取 */
  imageUrl?: string
  noticeType?: 'selection' | 'general' | 'video_reject'
  pinned?: boolean
}

function groupQrImageFromOrder(data: RegistrySnapshot, mpOrderId: string): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const o = (data.mpRecruitmentOrders || []).find((x) => x && x.id === id)
  if (!o) return ''
  const meta = o.mpPublishMeta && typeof o.mpPublishMeta === 'object' ? o.mpPublishMeta : {}
  return String(o.groupQrImage || (meta as { groupQrImage?: string }).groupQrImage || '').trim()
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
    let imageUrl = String(row.imageUrl || '').trim()
    const mpOrderId = row.mpOrderId ? String(row.mpOrderId).trim() : ''
    if (!imageUrl && mpOrderId && row.noticeType === 'selection') {
      imageUrl = groupQrImageFromOrder(data, mpOrderId)
    }
    if (!talentMemberId || !title) continue
    if (row.noticeType === 'selection' && !imageUrl) continue
    list.unshift({
      id: `inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      talentMemberId,
      title,
      body: body || title,
      category:
        row.category === 'order' || row.category === 'system' ? row.category : 'business',
      mpOrderId: row.mpOrderId ? String(row.mpOrderId).trim() : undefined,
      contact: row.contact ? String(row.contact).trim() : undefined,
      platformAccount: row.platformAccount ? String(row.platformAccount).trim() : undefined,
      applicantId: row.applicantId ? String(row.applicantId).trim() : undefined,
      imageUrl: imageUrl || undefined,
      noticeType:
        row.noticeType === 'selection'
          ? 'selection'
          : row.noticeType === 'video_reject'
            ? 'video_reject'
            : undefined,
      pinned:
        row.pinned === true || (row.noticeType === 'selection' && row.pinned !== false) ? true : undefined,
      createdAt: now,
      read: false,
    })
    added += 1
  }
  if (!added) {
    const needQr = rows.some((r) => r.noticeType === 'selection')
    return {
      ok: false,
      error: needQr ? 'group_qr_missing_on_order' : 'invalid_entries',
      status: needQr ? 400 : 400,
    }
  }
  data.mpTalentInbox = list.slice(0, 5000)
  return { ok: true, count: added }
}
