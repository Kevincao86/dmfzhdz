import type { MpRegistry, TalentCardRow } from './types'
import { listPrEligibleOrders } from './recruitmentAi'
import { buildAllTalentsPool } from './recommendAllTalentsPool'

export type PrBoardId = 'talent' | 'shoot' | 'edit'

export const PR_BOARD_SEGMENTS: { id: PrBoardId; label: string }[] = [
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
]

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

/** 商家管理后台拍摄/剪辑团队库 1:1 */
function formatSupplierFromTeamLibrary(e: Record<string, unknown>, board: 'shoot' | 'edit'): TalentCardRow {
  const accountTags = Array.isArray(e.accountTags) ? (e.accountTags as string[]) : []
  const baseTags = board === 'shoot' ? ['拍摄团队'] : ['剪辑团队']
  const platform = String(e.platform || '抖音')
  return {
    id: String(e.memberId || e.id || ''),
    isPreview: false,
    name: String(
      e.platformNickname || e.wxNickName || (board === 'shoot' ? '拍摄团队' : '剪辑团队'),
    ),
    avatar: String(e.wxAvatarUrl || ''),
    platform,
    followers: '团队',
    followersRaw: 0,
    salesGrade: board === 'shoot' ? '拍摄服务' : '剪辑服务',
    douyinSalesLevel: '',
    quality: board === 'shoot' ? '拍摄' : '剪辑',
    tags: [...baseTags, ...accountTags.slice(0, 3)],
    accountTags,
    region: [e.province, e.city].filter(Boolean).join(' · '),
    gender: '不限',
    online: true,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

function suppliersFromTeamLibrary(reg: MpRegistry, board: 'shoot' | 'edit'): TalentCardRow[] {
  const list =
    board === 'shoot'
      ? Array.isArray(reg.shootTeamLibraryEntries)
        ? reg.shootTeamLibraryEntries
        : []
      : Array.isArray(reg.editTeamLibraryEntries)
        ? reg.editTeamLibraryEntries
        : []
  return list
    .map((e) => formatSupplierFromTeamLibrary(e as Record<string, unknown>, board))
    .filter((r) => r.id)
}

export function buildBoardPool(reg: MpRegistry, board: PrBoardId): TalentCardRow[] {
  if (board === 'talent') return buildAllTalentsPool(reg)
  return suppliersFromTeamLibrary(reg, board)
}

export function countPrOrdersForBoard(reg: MpRegistry, board: PrBoardId): number {
  return listPrEligibleOrders(reg, { board }).length
}
