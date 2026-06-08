/**
 * PR 推荐大厅三板块：达人 / 拍摄 / 剪辑
 */
const memberStore = require('./talentMember.js')
const chatKeys = require('./talentChatKeys.js')
const hallFilters = require('./recruitmentHallFilters.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')
const { isIceMpOrder } = require('./recruitmentUrgent.js')

const PR_BOARD_SEGMENTS = [
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
]

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

function boardRecruitTarget(board) {
  if (board === 'shoot') return 'shoot'
  if (board === 'edit') return 'edit'
  return 'talent'
}

function boardSearchPlaceholder(board) {
  if (board === 'shoot') return '搜索拍摄团队、昵称'
  if (board === 'edit') return '搜索剪辑团队、昵称'
  return '搜索达人昵称、ID'
}

function boardEmptyHint(board, kw, hasOrders) {
  if (kw) return `未找到「${kw}」相关的${boardLabel(board)}`
  if (!hasOrders) {
    if (board === 'shoot') return '发拍摄招募后，将按发单要求智能推荐拍摄团队'
    if (board === 'edit') return '发剪辑招募后，将按发单要求智能推荐剪辑团队'
    return '发达人招募后，将按发单要求智能推荐达人'
  }
  return `暂无高匹配${boardLabel(board)}，可调整筛选条件`
}

function boardLabel(board) {
  if (board === 'shoot') return '拍摄团队'
  if (board === 'edit') return '剪辑团队'
  return '达人'
}

function boardAllModeLabel(board) {
  if (board === 'shoot') return '全部拍摄团队'
  if (board === 'edit') return '全部剪辑团队'
  return '全部达人'
}

function boardMatchHint(board, orderCount) {
  const label = boardLabel(board)
  if (orderCount > 0) {
    return `已根据您最近 ${orderCount} 条${label}招募要求智能匹配 · 按匹配分从高到低`
  }
  return `发${label}招募后，将按发单要求智能推荐 · 按匹配分从高到低`
}

function accountTagsFromMember(m) {
  const primary = memberStore.primaryPlatformProfile(m)
  const prof = (primary && primary.profile) || {}
  return Array.isArray(prof.accountTags) ? prof.accountTags : []
}

function memberMatchesBoard(m, board) {
  const tags = accountTagsFromMember(m)
  const blob = tags.join(' ')
  if (board === 'shoot') return SHOOT_TAG_RE.test(blob)
  if (board === 'edit') return EDIT_TAG_RE.test(blob)
  return true
}

function formatFans(n) {
  const followers = Number(n) || 0
  if (followers >= 10000) return `${(followers / 10000).toFixed(1)}万`
  if (followers > 0) return `${followers}`
  return '—'
}

function formatTalentRow(row) {
  const followersRaw = Number(row.followers) || 0
  const platform = row.platform || '抖音'
  const tags = []
  if (row.qualityTag) tags.push(row.qualityTag)
  if (row.niche && row.niche !== '本地生活') tags.push(String(row.niche).slice(0, 8))
  const accountTags = Array.isArray(row.accountTags) ? row.accountTags : []
  return {
    id: row.id,
    boardType: 'talent',
    isPreview: false,
    isSupplier: false,
    name: row.platformNickname || row.name || '达人',
    avatar: row.avatarUrl || row.wxAvatarUrl || '',
    platform,
    platformIcon: hallFilters.platformIcon(platform),
    followers: formatFans(followersRaw),
    followersRaw,
    salesGrade: row.salesGrade || '',
    douyinSalesLevel: row.douyinSalesLevel || '',
    quality: row.qualityTag || (followersRaw >= 50000 ? '优质' : followersRaw >= 10000 ? '推荐' : '新锐'),
    tags: tags.length ? tags : ['本地生活'],
    accountTags,
    region: [row.province, row.city].filter(Boolean).join(' · ') || row.region || '',
    gender: row.gender || '不限',
    online: row.online !== false,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function formatSupplierFromMember(m, board) {
  const primary = memberStore.primaryPlatformProfile(m)
  const p = (primary && primary.profile) || {}
  const platform = (primary && primary.platform) || '抖音'
  const accountTags = accountTagsFromMember(m)
  const baseTags = board === 'shoot' ? ['拍摄团队'] : ['剪辑团队']
  const extra = accountTags.filter((t) =>
    board === 'shoot' ? SHOOT_TAG_RE.test(t) : EDIT_TAG_RE.test(t),
  )
  return {
    id: m.id,
    boardType: board,
    isPreview: false,
    isSupplier: true,
    name: p.platformNickname || m.wxNickName || (board === 'shoot' ? '拍摄团队' : '剪辑团队'),
    avatar: m.wxAvatarUrl || '',
    platform,
    platformIcon: hallFilters.platformIcon(platform),
    followers: '团队',
    followersRaw: 0,
    salesGrade: board === 'shoot' ? '拍摄服务' : '剪辑服务',
    douyinSalesLevel: '',
    quality: board === 'shoot' ? '拍摄' : '剪辑',
    tags: [...baseTags, ...extra.slice(0, 3)],
    accountTags,
    region: [m.province, m.city].filter(Boolean).join(' · '),
    gender: '不限',
    online: true,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function formatSupplierFromApplicant(a, board, idx) {
  const platform = a.platform || '抖音'
  const accountTags = Array.isArray(a.accountTags) ? a.accountTags : []
  const baseTags = board === 'shoot' ? ['拍摄团队'] : ['剪辑团队']
  return {
    id: a.talentMemberId || a.id || `applicant-${board}-${idx}`,
    boardType: board,
    isPreview: false,
    isSupplier: true,
    name: a.platformNickname || a.name || (board === 'shoot' ? '拍摄团队' : '剪辑团队'),
    avatar: a.avatarUrl || a.wxAvatarUrl || '',
    platform,
    platformIcon: hallFilters.platformIcon(platform),
    followers: a.followers ? formatFans(a.followers) : '团队',
    followersRaw: Number(a.followers) || 0,
    salesGrade: board === 'shoot' ? '拍摄服务' : '剪辑服务',
    douyinSalesLevel: '',
    quality: board === 'shoot' ? '拍摄' : '剪辑',
    tags: [...baseTags, ...accountTags.slice(0, 2)],
    accountTags,
    region: [a.province, a.city].filter(Boolean).join(' · ') || a.region || '',
    gender: a.gender || '不限',
    online: true,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function platAccountDedupeKey(platform, account) {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

function collectTalentDedupeKeys(source, primary) {
  const keys = []
  const id = String(source.id || '').trim()
  const lq = String(source.lingqiTalentId || '').trim()
  if (id) keys.push(`id:${id}`)
  if (lq) keys.push(`lq:${lq}`)
  const p = primary && primary.profile
  const plat = String((primary && primary.platform) || source.platform || '抖音')
  const pk = platAccountDedupeKey(plat, String((p && p.platformAccount) || source.platformAccount || ''))
  if (pk) keys.push(`pk:${pk}`)
  const phone = String(source.contact || '').replace(/\D/g, '').slice(-11)
  if (phone.length >= 11) keys.push(`ph:${phone}`)
  return keys
}

function appendTalentIfNew(row, keys, seen, out) {
  if (!row || !row.id) return
  for (let i = 0; i < keys.length; i++) {
    if (seen.has(keys[i])) return
  }
  for (let i = 0; i < keys.length; i++) seen.add(keys[i])
  seen.add(`id:${row.id}`)
  out.push(row)
}

function buildTalentPool(reg) {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const seen = new Set()
  const out = []

  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    if (!memberMatchesBoard(m, 'talent')) continue
    const primary = memberStore.primaryPlatformProfile(m)
    const p = (primary && primary.profile) || {}
    const platformAccount = String(p.platformAccount || '').trim()
    if (!platformAccount) continue
    const raw = Number(p.followers) || 0
    const tags = accountTagsFromMember(m)
    const mid = String((m && m.id) || '').trim()
    if (!mid) continue
    const row = formatTalentRow({
      id: mid,
      platformNickname: p.platformNickname || m.wxNickName,
      wxAvatarUrl: m.wxAvatarUrl,
      platform: (primary && primary.platform) || '抖音',
      followers: raw,
      province: m.province,
      city: m.city,
      qualityTag: '会员',
      gender: m.gender,
      accountTags: tags,
      douyinSalesLevel: p.douyinSalesLevel || '',
    })
    appendTalentIfNew(row, collectTalentDedupeKeys(m, primary), seen, out)
  }

  for (let j = 0; j < library.length; j++) {
    const e = library[j]
    const raw = Number(e.followers) || 0
    const chatId =
      chatKeys.canonicalTalentMemberIdFromRegistry(reg, String(e.id || e.lingqiTalentId || '')) ||
      String(e.id || e.lingqiTalentId || '')
    const row = formatTalentRow({
      ...e,
      id: chatId,
      qualityTag: raw >= 50000 ? '优质' : '推荐',
      gender: e.gender,
    })
    appendTalentIfNew(row, collectTalentDedupeKeys(e), seen, out)
  }

  return out
}

function suppliersFromRegistry(reg, board) {
  const target = boardRecruitTarget(board)
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const byId = new Map()

  for (const m of members) {
    if (!m || !m.id) continue
    if (!memberMatchesBoard(m, board)) continue
    byId.set(String(m.id), formatSupplierFromMember(m, board))
  }

  let idx = 0
  for (const mp of mpList) {
    if (!mp) continue
    const rt = recruitTargetFromMp(mp)
    if (rt !== target && !(board === 'edit' && isIceMpOrder(mp))) continue
    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const a of applicants) {
      if (!a) continue
      const key = String(a.talentMemberId || a.id || `ap-${idx}`)
      if (byId.has(key)) continue
      byId.set(key, formatSupplierFromApplicant(a, board, idx))
      idx += 1
    }
  }

  return [...byId.values()]
}

function buildBoardPool(reg, board) {
  if (board === 'talent') return buildTalentPool(reg)
  return suppliersFromRegistry(reg, board)
}

function countPrOrdersForBoard(reg, board) {
  const local = require('./applicationsStore.js').readPublishedOrders()
  const mpList = Array.isArray(reg?.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const target = boardRecruitTarget(board)
  let n = 0
  for (const item of local) {
    if (!item || !item.mpOrderId) continue
    const mp = mpList.find((o) => o && o.id === item.mpOrderId)
    if (!mp) continue
    if (mp.status !== 'open' && mp.status !== 'collecting') continue
    const rt = recruitTargetFromMp(mp)
    if (rt === target) {
      n += 1
      continue
    }
    if (board === 'edit' && isIceMpOrder(mp)) n += 1
  }
  return n
}

module.exports = {
  PR_BOARD_SEGMENTS,
  boardRecruitTarget,
  boardSearchPlaceholder,
  boardEmptyHint,
  boardLabel,
  boardAllModeLabel,
  boardMatchHint,
  buildBoardPool,
  countPrOrdersForBoard,
  formatTalentRow,
}
