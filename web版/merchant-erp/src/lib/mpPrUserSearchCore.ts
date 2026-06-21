import type { RegistryFile, RegistryMpPrUser } from './opsRegistryTypes.js'

export type MpPrUserSearchHit = {
  id: string
  lingqiPrId: string
  displayName: string
  city?: string
  accountType?: string
}

function prDisplayName(u: RegistryMpPrUser): string {
  if (u.accountType === 'personal') {
    return String(u.personalName || u.contactName || u.wxNickName || '').trim()
  }
  return String(u.companyName || u.contactName || u.wxNickName || '').trim()
}

function normalizeQuery(raw: string): string {
  return String(raw || '').trim().toLowerCase()
}

export function searchMpPrUsers(
  data: RegistryFile,
  query: string,
  limit = 12,
): MpPrUserSearchHit[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const users = Array.isArray(data.mpPrUsers) ? data.mpPrUsers : []
  const hits: { score: number; row: MpPrUserSearchHit }[] = []

  for (const u of users) {
    if (!u) continue
    const lingqiPrId = String(u.lingqiPrId || '').trim()
    const id = String(u.id || '').trim()
    const name = prDisplayName(u)
    const city = String(u.city || u.province || '').trim()
    const phone = String(u.contactPhone || '').replace(/\D/g, '')
    const hay = [lingqiPrId, id, name, u.contactName, u.companyName, u.personalName, u.wxNickName, phone]
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ')

    let score = 0
    if (lingqiPrId && lingqiPrId.toLowerCase() === q) score = 100
    else if (lingqiPrId && lingqiPrId.toLowerCase().includes(q)) score = 90
    else if (id && id.toLowerCase() === q) score = 85
    else if (name && name.toLowerCase().includes(q)) score = 80
    else if (hay.split(/\s+/).some((tok) => tok.startsWith(q))) score = 70
    else if (hay.includes(q)) score = 50
    else continue

    hits.push({
      score,
      row: {
        id,
        lingqiPrId: lingqiPrId || id,
        displayName: name || lingqiPrId || id,
        city: city || undefined,
        accountType: u.accountType,
      },
    })
  }

  hits.sort((a, b) => b.score - a.score || a.row.displayName.localeCompare(b.row.displayName, 'zh-CN'))
  const seen = new Set<string>()
  const out: MpPrUserSearchHit[] = []
  for (const h of hits) {
    const key = h.row.lingqiPrId || h.row.id
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(h.row)
    if (out.length >= limit) break
  }
  return out
}
