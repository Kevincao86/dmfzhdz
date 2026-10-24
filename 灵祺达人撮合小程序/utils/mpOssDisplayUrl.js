/**
 * modianningbo 这只 OSS 桶当前返回 UserDisable，手机直连也没有图。
 * mp-recruit-covers 下的展示地址改到已备案静态站：
 * https://mofangdianai.com/recruit-covers/…
 * 其它桶、以及群码等非封面前缀保持原样（账号恢复前本来也读不到）。
 */
const CDN_ORIGIN = 'https://mofangdianai.com/recruit-covers'

const COVER_OSS_RE =
  /^https?:\/\/modianningbo\.oss-[a-z0-9-]+\.aliyuncs\.com\/mp-recruit-covers\/([^?#]*)(\?[^#]*)?(#.*)?$/i

function rewriteOssDisplayUrl(raw) {
  if (typeof raw !== 'string' || raw.indexOf('aliyuncs.com') === -1) return raw
  const m = raw.trim().match(COVER_OSS_RE)
  if (!m) return raw
  const key = String(m[1] || '').replace(/^\/+/, '')
  if (!key) return raw
  return `${CDN_ORIGIN}/${key}${m[2] || ''}${m[3] || ''}`
}

function mapDeep(value, fn) {
  if (typeof value === 'string') return fn(value)
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const mapped = mapDeep(item, fn)
      if (mapped !== item) changed = true
      return mapped
    })
    return changed ? next : value
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  let changed = false
  const out = {}
  const keys = Object.keys(value)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const mapped = mapDeep(value[key], fn)
    if (mapped !== value[key]) changed = true
    out[key] = mapped
  }
  return changed ? out : value
}

function rewriteOssDisplayUrlDeep(value) {
  return mapDeep(value, rewriteOssDisplayUrl)
}

/** 云剪仍要 OSS 源地址。展示层若已改成静态站，提交前改回去。 */
function restoreOssCanonicalUrl(raw) {
  if (typeof raw !== 'string' || raw.indexOf('/recruit-covers/') === -1) return raw
  const m = raw
    .trim()
    .match(/^https?:\/\/mofangdianai\.com\/recruit-covers\/([^?#]*)(\?[^#]*)?(#.*)?$/i)
  if (!m) return raw
  const key = String(m[1] || '').replace(/^\/+/, '')
  if (!key) return raw
  return `https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/${key}${m[2] || ''}${m[3] || ''}`
}

function restoreOssCanonicalUrlDeep(value) {
  return mapDeep(value, restoreOssCanonicalUrl)
}

module.exports = {
  CDN_ORIGIN,
  rewriteOssDisplayUrl,
  rewriteOssDisplayUrlDeep,
  restoreOssCanonicalUrl,
  restoreOssCanonicalUrlDeep,
}
