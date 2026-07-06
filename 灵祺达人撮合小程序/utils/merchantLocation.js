function emptyFormFields() {
  return {
    merchantLocationAddress: '',
    merchantLocationName: '',
    merchantLocationLat: '',
    merchantLocationLng: '',
  }
}

function fromMapPick(res) {
  const name = String((res && res.name) || '').trim()
  const address = String((res && res.address) || name || '').trim()
  const latitude = Number(res && res.latitude)
  const longitude = Number(res && res.longitude)
  return {
    merchantLocationName: name,
    merchantLocationAddress: address,
    merchantLocationLat: Number.isFinite(latitude) ? String(latitude) : '',
    merchantLocationLng: Number.isFinite(longitude) ? String(longitude) : '',
  }
}

function hasMapCoords(fields) {
  const lat = Number(fields && fields.merchantLocationLat)
  const lng = Number(fields && fields.merchantLocationLng)
  return Number.isFinite(lat) && Number.isFinite(lng)
}

function toMeta(fields) {
  const address = String((fields && fields.merchantLocationAddress) || '').trim()
  const name = String((fields && fields.merchantLocationName) || '').trim()
  if (!address && !name) return null
  const lat = Number(fields.merchantLocationLat)
  const lng = Number(fields.merchantLocationLng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      name: name || address,
      address: address || name,
      latitude: lat,
      longitude: lng,
      source: 'map',
    }
  }
  return {
    name: name || address,
    address: address || name,
    source: 'text',
  }
}

function fromMeta(meta) {
  const loc = meta && meta.merchantLocation
  if (!loc || typeof loc !== 'object') return emptyFormFields()
  return {
    merchantLocationAddress: String(loc.address || '').trim(),
    merchantLocationName: String(loc.name || '').trim(),
    merchantLocationLat: loc.latitude != null && loc.latitude !== '' ? String(loc.latitude) : '',
    merchantLocationLng: loc.longitude != null && loc.longitude !== '' ? String(loc.longitude) : '',
  }
}

function readFromMp(mp) {
  const meta = mp && mp.mpPublishMeta
  if (meta && meta.merchantLocation) return fromMeta(meta)
  return emptyFormFields()
}

function parseNavLocation(mp) {
  const meta = mp && mp.mpPublishMeta
  const loc = meta && meta.merchantLocation
  if (!loc || typeof loc !== 'object') return null
  const lat = Number(loc.latitude)
  const lng = Number(loc.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    latitude: lat,
    longitude: lng,
    name: String(loc.name || loc.address || '商家位置').trim(),
    address: String(loc.address || loc.name || '').trim(),
  }
}

function displayText(fields) {
  const addr = String((fields && fields.merchantLocationAddress) || '').trim()
  const name = String((fields && fields.merchantLocationName) || '').trim()
  if (name && addr && name !== addr) return `${name} · ${addr}`
  return addr || name || ''
}

function displayFromMp(mp) {
  const meta = mp && mp.mpPublishMeta && mp.mpPublishMeta.merchantLocation
  if (meta && typeof meta === 'object') {
    return displayText({
      merchantLocationAddress: meta.address,
      merchantLocationName: meta.name,
    })
  }
  return ''
}

function recruitmentLine(fields) {
  const meta = toMeta(fields)
  if (!meta) return ''
  if (meta.source === 'map') {
    return `商家位置：${meta.name}${meta.address && meta.address !== meta.name ? `（${meta.address}）` : ''} [地图定位]`
  }
  return `商家位置：${meta.address || meta.name}`
}

function ensureChooseLocationPrivacy() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve()
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(),
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (/cancel/i.test(msg)) reject(new Error('cancel'))
        else reject(new Error(msg || '需要同意《隐私保护指引》后才能使用地图选点'))
      },
    })
  })
}

function formatChooseLocationError(err) {
  const msg = String((err && err.message) || (err && err.errMsg) || err || '')
  if (/cancel/i.test(msg)) return 'cancel'
  if (/requiredPrivateInfos|privacy agreement|need to be declared|未在隐私/i.test(msg)) {
    return '需先在隐私指引中声明位置信息'
  }
  if (/auth deny|auth denied|authorize/i.test(msg)) return '需要允许位置权限'
  const cleaned = msg.replace(/^chooseLocation:fail\s*/i, '').trim()
  return cleaned ? cleaned.slice(0, 28) : '地图选点失败'
}

function chooseLocationForPublish() {
  return ensureChooseLocationPrivacy().then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseLocation({
          success: resolve,
          fail: (e) => reject(new Error(String((e && e.errMsg) || 'chooseLocation:fail'))),
        })
      }),
  )
}

module.exports = {
  emptyFormFields,
  fromMapPick,
  hasMapCoords,
  toMeta,
  fromMeta,
  readFromMp,
  parseNavLocation,
  displayText,
  displayFromMp,
  recruitmentLine,
  chooseLocationForPublish,
  formatChooseLocationError,
}
