/** 招募详情页：PR 信息二维码 + 分享海报发单方名称（对齐 PR 用户库「名称」） */
const userProfile = require('./userProfile.js')

function looksLikePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length === 11 && /^1\d{10}$/.test(digits)
}

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

function registryUserToProfile(user) {
  if (!user || typeof user !== 'object') return null
  const accountType = user.accountType === 'personal' ? 'personal' : 'company'
  return {
    accountType,
    companyName: accountType === 'company' ? String(user.companyName || '').trim() : '',
    personalName: accountType === 'personal' ? String(user.personalName || '').trim() : '',
    contactName: String(user.contactName || '').trim(),
    contactPhone: String(user.contactPhone || '').trim(),
    province: String(user.province || '').trim(),
    city: String(user.city || '').trim(),
    intro: String(user.intro || '').trim(),
    lingqiPrId: String(user.lingqiPrId || '').trim(),
    id: String(user.id || '').trim(),
  }
}

function orderPublisherMetaKeys(mp) {
  if (!mp || typeof mp !== 'object') {
    return { lingqiPrId: '', registryPrId: '', participantKey: '' }
  }
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return {
    lingqiPrId: String(meta.lingqiPrId || '').trim(),
    registryPrId: String(meta.registryPrId || '').trim(),
    participantKey: String(meta.prParticipantKey || '').trim(),
  }
}

function findRegistryPrUserForOrder(mp, reg) {
  if (!mp || !reg) return null
  const users = Array.isArray(reg.mpPrUsers) ? reg.mpPrUsers : []
  if (!users.length) return null
  const { lingqiPrId, registryPrId, participantKey } = orderPublisherMetaKeys(mp)
  for (let i = 0; i < users.length; i++) {
    const u = users[i]
    if (!u) continue
    if (lingqiPrId && String(u.lingqiPrId || '').trim() === lingqiPrId) return u
    if (registryPrId && String(u.id || '').trim() === registryPrId) return u
  }
  if (participantKey) {
    for (let i = 0; i < users.length; i++) {
      const u = users[i]
      if (!u) continue
      const phone = String(u.contactPhone || '').replace(/\D/g, '').slice(-11)
      if (phone && participantKey === `pr_${phone}`) return u
    }
  }
  return null
}

function isSameAsOrderTitle(name, mp) {
  const n = String(name || '').trim()
  if (!n) return false
  const title = String((mp && mp.title) || '').trim()
  const customer = String((mp && mp.customerName) || '').trim()
  return (title && n === title) || (customer && n === customer)
}

function isValidPublisherDisplayName(name, mp) {
  const n = String(name || '').trim()
  if (!n || isSameAsOrderTitle(n, mp)) return false
  if (looksLikePhone(n)) return false
  return true
}

function displayNameFromProfile(profile, mp) {
  if (!profile) return ''
  const name = userProfile.prDisplayName(profile)
  return isValidPublisherDisplayName(name, mp) ? name : ''
}

function resolvePrName(meta, snap, mp) {
  const accountType = String(snap.accountType || meta.prAccountType || 'company').trim()
  if (accountType === 'personal') {
    const personal = String(snap.personalName || '').trim()
    if (isValidPublisherDisplayName(personal, mp)) return personal
  } else {
    const company = String(snap.companyName || '').trim()
    if (isValidPublisherDisplayName(company, mp)) return company
  }
  const display = String(meta.prDisplayName || '').trim()
  if (isValidPublisherDisplayName(display, mp)) return display
  const contact = String(snap.contactName || '').trim()
  if (isValidPublisherDisplayName(contact, mp)) return contact
  return ''
}

function resolveFreshPublisherProfile(mp, reg) {
  if (!mp) return null
  const fromRegistry = registryUserToProfile(findRegistryPrUserForOrder(mp, reg))
  if (fromRegistry && displayNameFromProfile(fromRegistry, mp)) return fromRegistry

  const fromOwner = resolveLivePrProfileForOrderShare(mp)
  if (fromOwner && displayNameFromProfile(fromOwner, mp)) return fromOwner

  return null
}

function resolveOrderPublisherDisplayName(mp, publisherProfile, reg) {
  if (!mp || typeof mp !== 'object') return ''
  let profile = publisherProfile || null
  if (!profile && reg) {
    profile = registryUserToProfile(findRegistryPrUserForOrder(mp, reg))
  }
  const fromProfile = displayNameFromProfile(profile, mp)
  if (fromProfile) return fromProfile

  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? meta.prProfileSnapshot
      : {}
  const fromSnap = resolvePrName(meta, snap, mp)
  if (fromSnap) return fromSnap
  return ''
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

function orderForShareWithLiveProfile(mp, livePrProfile, reg) {
  if (!mp || typeof mp !== 'object') return mp
  const fresh =
    livePrProfile ||
    resolveFreshPublisherProfile(mp, reg) ||
    resolveLivePrProfileForOrderShare(mp)
  if (!fresh) return mp
  const name = displayNameFromProfile(fresh, mp)
  if (!name) return mp
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? { ...mp.mpPublishMeta } : {}
  meta.prDisplayName = name
  meta.prProfileSnapshot = buildPrProfileSnapshot(fresh)
  meta.prAccountType = fresh.accountType || meta.prAccountType || 'company'
  return {
    ...mp,
    mpPublishMeta: meta,
  }
}

async function resolveOrderForSharePoster(mp, regOptional) {
  if (!mp) return mp
  let reg = regOptional || null
  try {
    const auth = require('./auth.js')
    const prPublishedOrders = require('./prPublishedOrders.js')
    const account = auth.readAccount()
    if (account && prPublishedOrders.mpOrderOwnedByCurrentPr(mp, account)) {
      try {
        await require('./registryProfileSync.js').pullRegistryProfileAfterLogin()
      } catch (_) {}
    }
  } catch (_) {}

  if (!reg) {
    try {
      const api = require('./api.js')
      const id = String(mp.id || '').trim()
      if (api.hasApi() && id) {
        const ops = require('./opsRegistryTalentMp.js')
        reg = await ops.fetchRegistry({ includeMpOrderIds: [id], includeLocalContext: true })
      }
    } catch (_) {}
  }
  return orderForShareWithLiveProfile(mp, null, reg)
}

function buildPrInfoText(mp) {
  if (!mp) return ''
  const name = resolveOrderPublisherDisplayName(mp) || '招募方'
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? meta.prProfileSnapshot
      : {}
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
  registryUserToProfile,
  findRegistryPrUserForOrder,
  resolveOrderPublisherDisplayName,
  resolveFreshPublisherProfile,
  resolveLivePrProfileForOrderShare,
  orderForShareWithLiveProfile,
  resolveOrderForSharePoster,
}
