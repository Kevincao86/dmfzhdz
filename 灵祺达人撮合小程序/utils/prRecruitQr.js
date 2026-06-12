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

function isSameAsOrderTitle(name, mp) {
  const n = String(name || '').trim()
  if (!n) return false
  const title = String((mp && mp.title) || '').trim()
  const customer = String((mp && mp.customerName) || '').trim()
  return (title && n === title) || (customer && n === customer)
}

function resolvePrName(meta, snap, mp) {
  const accountType = String(snap.accountType || meta.prAccountType || 'company').trim()
  if (accountType === 'personal') {
    const personal = String(snap.personalName || '').trim()
    if (personal && !isSameAsOrderTitle(personal, mp)) return personal
  } else {
    const company = String(snap.companyName || '').trim()
    if (company && !isSameAsOrderTitle(company, mp)) return company
  }
  const display = String(meta.prDisplayName || '').trim()
  if (display && !isSameAsOrderTitle(display, mp)) return display
  if (accountType === 'personal') {
    const contact = String(snap.contactName || '').trim()
    if (contact && !isSameAsOrderTitle(contact, mp)) return contact
  } else {
    const contact = String(snap.contactName || '').trim()
    if (contact && !isSameAsOrderTitle(contact, mp)) return contact
  }
  return ''
}

function resolveOrderPublisherDisplayName(mp, livePrProfile) {
  if (!mp || typeof mp !== 'object') return ''
  if (livePrProfile) {
    const live = userProfile.prDisplayName(livePrProfile)
    if (live) return live
  }
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? meta.prProfileSnapshot
      : {}
  return resolvePrName(meta, snap, mp)
}

function resolveLivePrProfileForOrderShare(mp) {
  if (!mp) return null
  try {
    const auth = require('./auth.js')
    const prPublishedOrders = require('./prPublishedOrders.js')
    const account = auth.readAccount()
    if (!account || !prPublishedOrders.mpOrderOwnedByCurrentPr(mp, account)) return null
    return userProfile.readPrProfile()
  } catch (_) {
    return null
  }
}

/** 分享/海报：发单方 PR 资料变更后，用最新公司名或个人名覆盖发布快照 */
function orderForShareWithLiveProfile(mp, livePrProfile) {
  if (!mp || typeof mp !== 'object') return mp
  const live = livePrProfile || resolveLivePrProfileForOrderShare(mp)
  if (!live) return mp
  const name = userProfile.prDisplayName(live)
  if (!name) return mp
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? { ...mp.mpPublishMeta } : {}
  meta.prDisplayName = name
  meta.prProfileSnapshot = buildPrProfileSnapshot(live)
  return {
    ...mp,
    mpPublishMeta: meta,
  }
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
  resolveOrderPublisherDisplayName,
  resolveLivePrProfileForOrderShare,
  orderForShareWithLiveProfile,
}
