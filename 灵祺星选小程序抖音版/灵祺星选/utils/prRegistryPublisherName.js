/** 与商家后台 PR 用户库「名称」列一致：个人→personalName，机构→companyName */

function looksLikePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length === 11 && /^1\d{10}$/.test(digits)
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

/** 对齐 OpsPrLibraryPage：accountType===personal ? personalName : companyName */
function prUserRegistryDisplayName(user) {
  if (!user || typeof user !== 'object') return ''
  if (user.accountType === 'personal') {
    return String(user.personalName || '').trim()
  }
  return String(user.companyName || '').trim()
}

function publisherNameCandidates(user) {
  if (!user || typeof user !== 'object') return []
  const primary = prUserRegistryDisplayName(user)
  if (user.accountType === 'personal') {
    return [primary, user.companyName, user.contactName]
  }
  return [primary, user.personalName, user.contactName]
}

/** 分享海报：PR 用户库名称，不与订单标题比对（标题常含同一项目名） */
function prUserRegistryDisplayNameForPoster(user) {
  const name = prUserRegistryDisplayName(user)
  if (!name || looksLikePhone(name) || name === '灵祺星选') return ''
  return name
}

function resolvePublisherDisplayNameForPoster(user, mp) {
  const primary = prUserRegistryDisplayNameForPoster(user)
  if (primary) return primary
  return resolvePublisherDisplayNameFromUser(user, mp)
}

function resolvePublisherDisplayNameFromUser(user, mp) {
  const list = publisherNameCandidates(user)
  for (let i = 0; i < list.length; i += 1) {
    const name = String(list[i] || '').trim()
    if (isValidPublisherDisplayName(name, mp)) return name
  }
  return ''
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

function userMatchesOrderPublisherKeys(user, keys) {
  if (!user || !keys) return false
  const uLq = String(user.lingqiPrId || '').trim()
  const uId = String(user.id || '').trim()
  const lingqiPrId = String(keys.lingqiPrId || '').trim()
  const registryPrId = String(keys.registryPrId || '').trim()
  const participantKey = String(keys.participantKey || '').trim()
  if (lingqiPrId && (uLq === lingqiPrId || uId === lingqiPrId)) return true
  if (registryPrId && (uId === registryPrId || uLq === registryPrId)) return true
  if (participantKey) {
    const phone = String(user.contactPhone || '')
      .replace(/\D/g, '')
      .slice(-11)
    if (phone && participantKey === `pr_${phone}`) return true
  }
  return false
}

function matchRegistryPrUserForOrder(mp, users) {
  const list = Array.isArray(users) ? users : []
  if (!mp || !list.length) return null
  const keys = orderPublisherMetaKeys(mp)
  const matched = []
  for (let i = 0; i < list.length; i += 1) {
    const u = list[i]
    if (u && userMatchesOrderPublisherKeys(u, keys)) matched.push(u)
  }
  if (matched.length === 1) return matched[0]
  if (matched.length > 1) {
    const reg = String(keys.registryPrId || '').trim()
    if (reg) {
      const hit = matched.find(
        (u) => String(u.id || '').trim() === reg || String(u.lingqiPrId || '').trim() === reg,
      )
      if (hit) return hit
    }
    const lq = String(keys.lingqiPrId || '').trim()
    if (lq) {
      const hit = matched.find(
        (u) => String(u.lingqiPrId || '').trim() === lq || String(u.id || '').trim() === lq,
      )
      if (hit) return hit
    }
  }
  if (list.length === 1 && (keys.lingqiPrId || keys.registryPrId || keys.participantKey)) {
    return list[0]
  }
  return null
}

function profileFromPublisherUser(user, displayName) {
  if (user && typeof user === 'object') {
    const accountType = user.accountType === 'personal' ? 'personal' : 'company'
    return {
      accountType,
      companyName: accountType === 'company' ? String(user.companyName || displayName || '').trim() : '',
      personalName: accountType === 'personal' ? String(user.personalName || displayName || '').trim() : '',
      contactName: String(user.contactName || '').trim(),
      contactPhone: String(user.contactPhone || '').trim(),
      province: String(user.province || '').trim(),
      city: String(user.city || '').trim(),
      intro: String(user.intro || '').trim(),
      lingqiPrId: String(user.lingqiPrId || '').trim(),
      id: String(user.id || '').trim(),
    }
  }
  const name = String(displayName || '').trim()
  if (!name) return null
  return {
    accountType: 'company',
    companyName: name,
    personalName: '',
    contactName: '',
  }
}

module.exports = {
  looksLikePhone,
  isValidPublisherDisplayName,
  prUserRegistryDisplayName,
  prUserRegistryDisplayNameForPoster,
  resolvePublisherDisplayNameForPoster,
  resolvePublisherDisplayNameFromUser,
  orderPublisherMetaKeys,
  userMatchesOrderPublisherKeys,
  matchRegistryPrUserForOrder,
  profileFromPublisherUser,
}
