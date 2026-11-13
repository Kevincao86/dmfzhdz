/** 本地模糊搜索 PR（与后端 mpPrUserSearchCore 规则对齐） */

function prDisplayName(u) {
  if (!u || typeof u !== 'object') return ''
  if (u.accountType === 'personal') {
    return String(u.personalName || u.contactName || u.wxNickName || '').trim()
  }
  return String(u.companyName || u.contactName || u.wxNickName || '').trim()
}

function searchMpPrUsersLocal(users, query, limit) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const list = Array.isArray(users) ? users : []
  const max = limit || 12
  const hits = []

  for (let i = 0; i < list.length; i += 1) {
    const u = list[i]
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

  hits.sort((a, b) => b.score - a.score || String(a.row.displayName).localeCompare(String(b.row.displayName), 'zh-CN'))
  const seen = new Set()
  const out = []
  for (let j = 0; j < hits.length; j += 1) {
    const key = hits[j].row.lingqiPrId || hits[j].row.id
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(hits[j].row)
    if (out.length >= max) break
  }
  return out
}

module.exports = {
  prDisplayName,
  searchMpPrUsersLocal,
}
