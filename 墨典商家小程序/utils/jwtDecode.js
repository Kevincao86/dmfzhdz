/** 解析 Supabase JWT payload 中的 sub（不解签，仅供客户端 REST 组装查询）。 */

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    if (typeof atob === 'undefined') return null
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}

function decodeJwtSub(token) {
  const p = decodeJwtPayload(token)
  return p && typeof p.sub === 'string' ? p.sub : null
}

module.exports = { decodeJwtPayload, decodeJwtSub }
