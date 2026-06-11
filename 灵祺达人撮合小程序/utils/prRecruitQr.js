/** 招募详情页：PR 信息二维码（扫码可见名称/联系人/省市/简介） */
const userProfile = require('./userProfile.js')

function buildPrProfileSnapshot(pr) {
  const p = pr || userProfile.emptyPrProfile()
  return {
    accountType: p.accountType || 'company',
    companyName: String(p.companyName || '').trim(),
    personalName: String(p.personalName || '').trim(),
    contactName: String(p.contactName || '').trim(),
    province: String(p.province || '').trim(),
    city: String(p.city || '').trim(),
    intro: String(p.intro || '').trim().slice(0, 120),
  }
}

function resolvePrName(meta, snap, mp) {
  if (meta.prDisplayName) return String(meta.prDisplayName).trim()
  if (snap.accountType === 'personal') {
    return String(snap.personalName || snap.contactName || '').trim()
  }
  return String(snap.companyName || snap.contactName || mp.customerName || '').trim()
}

function buildPrInfoText(mp) {
  if (!mp) return ''
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? meta.prProfileSnapshot
      : {}
  const name = resolvePrName(meta, snap, mp) || '招募方'
  const contact = String(snap.contactName || meta.prContactName || '').trim()
  const region = [snap.province || meta.prProvince, snap.city || meta.prCity]
    .filter(Boolean)
    .join(' ')
    .trim() || String(mp.region || '').trim()
  const intro = String(snap.intro || meta.prIntro || '').trim().slice(0, 120)
  const lines = [`【招募方】${name}`]
  if (contact) lines.push(`联系人：${contact}`)
  if (region) lines.push(`地区：${region}`)
  if (intro) lines.push(`简介：${intro}`)
  return lines.join('\n')
}

function buildPrQrScanUrl(mp) {
  const id = String((mp && mp.id) || '').trim()
  if (!id) return ''
  return `https://dr.mofangdianai.com/pr-info/${encodeURIComponent(id)}`
}

function renderPrQrImage(page, payload, canvasSelector) {
  const content = String(payload || '').trim()
  if (!content || !page) return Promise.resolve('')
  const selector = canvasSelector || '#detailPrQrCanvas'
  const UQRCode = require('./uqrcode.js')
  const size = 120
  return new Promise((resolve) => {
    const query = wx.createSelectorQuery().in(page)
    query
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node
        if (!node) {
          resolve('')
          return
        }
        try {
          const dpr = wx.getSystemInfoSync().pixelRatio || 2
          node.width = size * dpr
          node.height = size * dpr
          const ctx = node.getContext('2d')
          ctx.scale(dpr, dpr)
          const qr = new UQRCode()
          qr.data = content
          qr.size = size
          qr.margin = 6
          qr.backgroundColor = '#ffffff'
          qr.foregroundColor = '#1e293b'
          qr.make()
          qr.canvasContext = ctx
          qr.drawCanvas()
            .then(() => {
              wx.canvasToTempFilePath({
                canvas: node,
                width: size,
                height: size,
                destWidth: size * dpr,
                destHeight: size * dpr,
                success: (r) => resolve(r.tempFilePath || ''),
                fail: () => resolve(''),
              })
            })
            .catch(() => resolve(''))
        } catch (_) {
          resolve('')
        }
      })
  })
}

module.exports = {
  buildPrProfileSnapshot,
  buildPrInfoText,
  buildPrQrScanUrl,
  renderPrQrImage,
}
