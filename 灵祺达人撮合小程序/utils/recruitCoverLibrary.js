const manifest = require('./recruitCoverLibrary.manifest.js')
const config = require('./config.js')

/** 封面图走星选 Web CDN，不打包进小程序主包 */
const MP_COVER_ROOT = `${String(config.RECRUIT_COVER_CDN_BASE || 'https://mofangdianai.com/recruit-covers').replace(/\/$/, '')}/`

/** 小程序封面分包（高压缩 JPEG，与星选 Web CDN 分离） */
const MP_COVER_SUBPACK = 'recruitCoversMp'
const MP_COVER_BUNDLE_ROOT = '/packages/recruit-covers-mp'

function useCoverBundle() {
  if (config.MP_COVER_USE_CDN === true && !config.MP_USE_CLOUD_PROXY) return false
  return true
}

function mpAssetUrl(relPath) {
  const rel = String(relPath || '').replace(/^\/+/, '')
  if (useCoverBundle()) return `${MP_COVER_BUNDLE_ROOT}/${rel}`
  return `${MP_COVER_ROOT}${rel}`
}

function loadCoverSubpackages() {
  if (!useCoverBundle()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (typeof wx.loadSubpackage === 'function') {
      wx.loadSubpackage({
        name: MP_COVER_SUBPACK,
        success: () => resolve(),
        fail: (err) => reject(new Error((err && err.errMsg) || '封面分包加载失败')),
      })
      return
    }
    if (typeof wx.preloadSubpackage === 'function') {
      wx.preloadSubpackage({
        name: MP_COVER_SUBPACK,
        success: () => resolve(),
        fail: (err) => reject(new Error((err && err.errMsg) || '封面分包预加载失败')),
      })
      return
    }
    resolve()
  })
}

function preloadCoverSubpackages() {
  return loadCoverSubpackages()
}

function findCoverById(id) {
  const key = String(id || '').trim()
  if (!key) return null
  for (const list of Object.values(manifest.platforms || {})) {
    const hit = (list || []).find((x) => x.id === key)
    if (hit) return { ...hit, url: mpAssetUrl(hit.path) }
  }
  for (const list of Object.values(manifest.tags || {})) {
    const hit = (list || []).find((x) => x.id === key)
    if (hit) return { ...hit, url: mpAssetUrl(hit.path) }
  }
  return null
}

function getPlatformCovers(platform) {
  const list = (manifest.platforms || {})[String(platform || '').trim()] || []
  return list.map((x) => ({ ...x, url: mpAssetUrl(x.path) }))
}

function getTagCovers(tag) {
  const list = (manifest.tags || {})[String(tag || '').trim()] || []
  return list.map((x) => ({ ...x, url: mpAssetUrl(x.path) }))
}

function getSuggestedGalleryItems(platform, talentTags) {
  const out = []
  const seen = new Set()
  const add = (item) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
  }
  getPlatformCovers(platform).forEach(add)
  ;(talentTags || []).forEach((tag) => getTagCovers(tag).forEach(add))
  if (!out.length) getPlatformCovers('抖音').forEach(add)
  return out
}

function listCoverPlatformNames() {
  return Object.keys(manifest.platforms || {})
}

function listCoverTagNames() {
  return Object.keys(manifest.tags || {})
}

function getAllGalleryItems() {
  const out = []
  const seen = new Set()
  const add = (item) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    out.push({ ...item, url: mpAssetUrl(item.path) })
  }
  for (const list of Object.values(manifest.platforms || {})) {
    ;(list || []).forEach(add)
  }
  for (const list of Object.values(manifest.tags || {})) {
    ;(list || []).forEach(add)
  }
  return out
}

function getGalleryItemsForTab(tab, platform, talentTags, subKey) {
  const key = String(subKey || '').trim()
  if (tab === 'recommended') return getSuggestedGalleryItems(platform, talentTags)
  if (tab === 'all') return getAllGalleryItems()
  if (tab === 'platform') return getPlatformCovers(key || platform || '抖音')
  if (tab === 'tag') {
    const tagKey = key || (talentTags && talentTags[0]) || listCoverTagNames()[0] || '美食'
    return getTagCovers(tagKey)
  }
  return getAllGalleryItems()
}

function resolveDefaultCover(platform, talentTags) {
  const platformCovers = getPlatformCovers(platform)
  if (platformCovers.length) return platformCovers[0]
  for (const tag of talentTags || []) {
    const tagCovers = getTagCovers(tag)
    if (tagCovers.length) return tagCovers[0]
  }
  return getPlatformCovers('抖音')[0] || { id: 'platform-douyin-1', path: 'platforms/douyin-1.jpg', url: mpAssetUrl('platforms/douyin-1.jpg'), label: '默认封面' }
}

function remapCdnCoverToBundle(url) {
  const s = String(url || '').trim()
  const m = s.match(/\/recruit-covers\/((?:platforms|tags)\/[^?#]+)/i)
  if (m && useCoverBundle()) return mpAssetUrl(m[1])
  return ''
}

function coverImageFromOrder(order) {
  if (!order) return ''
  const meta = order.mpPublishMeta && typeof order.mpPublishMeta === 'object' ? order.mpPublishMeta : {}
  return String(order.coverImage || meta.coverImage || '').trim()
}

function resolveOrderCoverUrl(order) {
  const meta = order.mpPublishMeta && typeof order.mpPublishMeta === 'object' ? order.mpPublishMeta : {}
  const libId = String(meta.coverLibraryId || order.coverLibraryId || '').trim()
  if (libId) {
    const hit = findCoverById(libId)
    if (hit) return hit.url
  }
  const custom = coverImageFromOrder(order)
  if (custom) {
    const bundled = remapCdnCoverToBundle(custom)
    return bundled || custom
  }
  const platform = String(order.platform || meta.platform || '').trim()
  const tags = Array.isArray(meta.talentTags) ? meta.talentTags : []
  return resolveDefaultCover(platform, tags).url
}

/** 微信分享 imageUrl：包内路径 / https；data URL 需先落盘 */
function resolveShareImageUrl(coverUrl) {
  const img = String(coverUrl || '').trim()
  if (!img) return ''
  if (/^https?:\/\//i.test(img)) return img
  if (img.startsWith('/packages/') || img.startsWith('/assets/')) return img
  if (img.startsWith('data:image/')) return img
  if (img.startsWith('wxfile://') || img.startsWith('http://tmp/')) return img
  return img
}

function buildCoverFieldsForOrder(form) {
  const upload = String(form.coverImage || '').trim()
  const libId = String(form.coverLibraryId || '').trim()
  if (upload) {
    return {
      coverImage: upload,
      coverLibraryId: '',
      coverImageSource: 'upload',
    }
  }
  if (libId) {
    const hit = findCoverById(libId)
    return {
      coverImage: hit ? hit.url : '',
      coverLibraryId: libId,
      coverImageSource: 'library',
    }
  }
  const def = resolveDefaultCover(form.platform, form.talentTags || [])
  return {
    coverImage: def.url,
    coverLibraryId: def.id,
    coverImageSource: 'default',
  }
}

module.exports = {
  manifest,
  MP_COVER_ROOT,
  MP_COVER_SUBPACK,
  MP_COVER_BUNDLE_ROOT,
  useCoverBundle,
  mpAssetUrl,
  preloadCoverSubpackages,
  loadCoverSubpackages,
  findCoverById,
  getPlatformCovers,
  getTagCovers,
  getSuggestedGalleryItems,
  listCoverPlatformNames,
  listCoverTagNames,
  getAllGalleryItems,
  getGalleryItemsForTab,
  resolveDefaultCover,
  coverImageFromOrder,
  resolveOrderCoverUrl,
  resolveShareImageUrl,
  buildCoverFieldsForOrder,
}
