import type { MpRegistry, TalentCardRow } from './types'
import { isIceMpOrder, recruitTargetFromMp } from './orderCard'
import { listPrEligibleOrders } from './recruitmentAi'
import { buildAllTalentsPool } from './recommendAllTalentsPool'
import { primaryPlatformProfile } from '../mpSync/talentMember'

export type PrBoardId = 'talent' | 'shoot' | 'edit'

export const PR_BOARD_SEGMENTS: { id: PrBoardId; label: string }[] = [
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
]

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

export function boardRecruitTarget(board: PrBoardId): PrBoardId {
  return board
}

export function boardSearchPlaceholder(board: PrBoardId): string {
  if (board === 'shoot') return '搜索拍摄团队、昵称'
  if (board === 'edit') return '搜索剪辑团队、昵称'
  return '搜索达人昵称、ID'
}

export function boardLabel(board: PrBoardId): string {
  if (board === 'shoot') return '拍摄团队'
  if (board === 'edit') return '剪辑团队'
  return '达人'
}

export function boardAllModeLabel(board: PrBoardId): string {
  if (board === 'shoot') return '全部拍摄团队'
  if (board === 'edit') return '全部剪辑团队'
  return '全部达人'
}

export function boardEmptyHint(board: PrBoardId, kw: string, hasOrders: boolean): string {
  if (kw) return `未找到「${kw}」相关的${boardLabel(board)}`
  if (!hasOrders) return smartMatchNeedRecruitHint(board)
  return `暂无高匹配${boardLabel(board)}，可调整筛选条件`
}

export function smartMatchNeedRecruitHint(board: PrBoardId): string {
  if (board === 'shoot') return '请创建拍摄招募，以便AI匹配拍摄团队'
  if (board === 'edit') return '请创建剪辑招募，以便AI匹配剪辑团队'
  return '请创建招募，以便AI匹配达人'
}

export function boardMatchHint(board: PrBoardId, orderCount: number): string {
  const label = boardLabel(board)
  if (orderCount > 0) return `已根据您最近 ${orderCount} 条${label}招募要求智能匹配`
  return `发${label}招募后，将按发单要求智能推荐${label}`
}

function accountTagsFromMember(m: Record<string, unknown>): string[] {
  const primary = primaryPlatformProfile(m)
  const prof = primary?.profile
  return Array.isArray(prof?.accountTags) ? (prof.accountTags as string[]) : []
}

function memberMatchesBoard(m: Record<string, unknown>, board: PrBoardId): boolean {
  const tags = accountTagsFromMember(m)
  const blob = tags.join(' ')
  if (board === 'shoot') return SHOOT_TAG_RE.test(blob)
  if (board === 'edit') return EDIT_TAG_RE.test(blob)
  return true
}

function formatFans(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n > 0) return `${n}`
  return '—'
}

function formatSupplierFromMember(m: Record<string, unknown>, board: 'shoot' | 'edit'): TalentCardRow {
  const primary = primaryPlatformProfile(m)
  const p = primary?.profile
  const platform = primary?.platform || '抖音'
  const accountTags = accountTagsFromMember(m)
  const baseTags = board === 'shoot' ? ['拍摄团队'] : ['剪辑团队']
  const extra = accountTags.filter((t) => (board === 'shoot' ? SHOOT_TAG_RE.test(t) : EDIT_TAG_RE.test(t)))
  return {
    id: String(m.id),
    isPreview: false,
    name: String(p?.platformNickname || m.wxNickName || (board === 'shoot' ? '拍摄团队' : '剪辑团队')),
    avatar: String(m.wxAvatarUrl || ''),
    platform,
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

function formatSupplierFromApplicant(a: Record<string, unknown>, board: 'shoot' | 'edit', idx: number): TalentCardRow {
  const platform = String(a.platform || '抖音')
  const accountTags = Array.isArray(a.accountTags) ? (a.accountTags as string[]) : []
  const baseTags = board === 'shoot' ? ['拍摄团队'] : ['剪辑团队']
  const raw = Number(a.followers) || 0
  return {
    id: String(a.talentMemberId || a.id || `applicant-${board}-${idx}`),
    isPreview: false,
    name: String(a.platformNickname || a.name || (board === 'shoot' ? '拍摄团队' : '剪辑团队')),
    avatar: String(a.avatarUrl || a.wxAvatarUrl || ''),
    platform,
    followers: raw ? formatFans(raw) : '团队',
    followersRaw: raw,
    salesGrade: board === 'shoot' ? '拍摄服务' : '剪辑服务',
    douyinSalesLevel: '',
    quality: board === 'shoot' ? '拍摄' : '剪辑',
    tags: [...baseTags, ...accountTags.slice(0, 2)],
    accountTags,
    region: [a.province, a.city].filter(Boolean).join(' · ') || String(a.region || ''),
    gender: String(a.gender || '不限'),
    online: true,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function suppliersFromRegistry(reg: MpRegistry, board: 'shoot' | 'edit'): TalentCardRow[] {
  const target = board
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const byId = new Map<string, TalentCardRow>()

  for (const m of members) {
    const mem = m as Record<string, unknown>
    if (!mem?.id) continue
    if (!memberMatchesBoard(mem, board)) continue
    byId.set(String(mem.id), formatSupplierFromMember(mem, board))
  }

  let idx = 0
  for (const mp of mpList) {
    const order = mp as Record<string, unknown>
    if (!order) continue
    const rt = recruitTargetFromMp(order)
    if (rt !== target && !(board === 'edit' && isIceMpOrder(order))) continue
    const applicants = Array.isArray(order.applicants) ? order.applicants : []
    for (const a of applicants) {
      const app = a as Record<string, unknown>
      if (!app) continue
      const key = String(app.talentMemberId || app.id || `ap-${idx}`)
      if (byId.has(key)) continue
      byId.set(key, formatSupplierFromApplicant(app, board, idx))
      idx += 1
    }
  }

  return [...byId.values()]
}

export function buildBoardPool(reg: MpRegistry, board: PrBoardId): TalentCardRow[] {
  if (board === 'talent') return buildAllTalentsPool(reg)
  return suppliersFromRegistry(reg, board)
}

export function countPrOrdersForBoard(reg: MpRegistry, board: PrBoardId): number {
  return listPrEligibleOrders(reg, { board }).length
}
