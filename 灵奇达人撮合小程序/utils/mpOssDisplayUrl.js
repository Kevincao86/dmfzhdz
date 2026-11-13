/**
 * 展示图走 OSS。这里不再把 mp-recruit-covers 改写到备案静态站。
 * restoreOssCanonicalUrl 仍把已经落到备案域名的地址还原成 OSS，给云剪用。
 */
const CDN_ORIGIN = 'https://mofangdianai.com/recruit-covers'

function rewriteOssDisplayUrl(raw) {
  return raw
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
