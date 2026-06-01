/** 解析 Supabase JWT payload 中的 sub（不解签，仅供客户端 REST 组装查询）。 */

function base64UrlToUtf8(b64url) {
  let b64 = String(b64url || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  while (b64.length % 4) b64 += '='

  if (typeof atob !== 'undefined') {
    return atob(b64)
  }

  if (typeof wx !== 'undefined' && typeof wx.base64ToArrayBuffer === 'function') {
    const ab = wx.base64ToArrayBuffer(b64)
    const u8 = new Uint8Array(ab)
    let out = ''
    for (let i = 0; i < u8.length; i++) out += String.fromCharCode(u8[i])
    return out
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let output = ''
  let i = 0
  while (i < b64.length) {
    const enc1 = alphabet.indexOf(b64.charAt(i++))
    const enc2 = alphabet.indexOf(b64.charAt(i++))
    const enc3 = alphabet.indexOf(b64.charAt(i++))
    const enc4 = alphabet.indexOf(b64.charAt(i++))
    const chr1 = (enc1 << 2) | (enc2 >> 4)
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2)
    const chr3 = ((enc3 & 3) << 6) | enc4
    output += String.fromCharCode(chr1)
    if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2)
    if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3)
  }
  return output
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    const json = base64UrlToUtf8(parts[1])
    return JSON.parse(json)
  } catch {
    return null
  }
}

function decodeJwtSub(token) {
  const p = decodeJwtPayload(token)
  return p && typeof p.sub === 'string' ? p.sub : null
}

module.exports = { decodeJwtPayload, decodeJwtSub, base64UrlToUtf8 }
