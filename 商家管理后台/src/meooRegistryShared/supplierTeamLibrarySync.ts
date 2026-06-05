import type {
  RegistryFile,
  RegistryMpTalentMember,
  RegistrySupplierTeamLibraryEntry,
} from './opsRegistryTypes.js'

export const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场|拍摄团队/
export const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕|剪辑团队/

export type SupplierTeamRole = 'shoot' | 'edit'

function collectMemberTags(m: RegistryMpTalentMember): string[] {
  const tags = [...(m.accountTags || [])]
  if (m.workIdentity === 'shoot') tags.push('拍摄团队', '拍摄', '跟拍')
  if (m.workIdentity === 'edit') tags.push('剪辑团队', '剪辑', '后期')
  if (m.douyin?.accountTags?.length) tags.push(...m.douyin.accountTags)
  if (m.xiaohongshu?.accountTags?.length) tags.push(...m.xiaohongshu.accountTags)
  return tags
}

export function memberSupplierRole(m: RegistryMpTalentMember): SupplierTeamRole | null {
  if (m.workIdentity === 'shoot') return 'shoot'
  if (m.workIdentity === 'edit') return 'edit'
  const blob = collectMemberTags(m).join(' ')
  const shoot = SHOOT_TAG_RE.test(blob)
  const edit = EDIT_TAG_RE.test(blob)
  if (shoot && !edit) return 'shoot'
  if (edit && !shoot) return 'edit'
  if (shoot && edit) return 'shoot'
  return null
}

function primaryPlatform(m: RegistryMpTalentMember) {
  if (m.memberType === 'xiaohongshu' && m.xiaohongshu) {
    return { platform: '小红书' as const, profile: m.xiaohongshu }
  }
  if (m.douyin) return { platform: '抖音' as const, profile: m.douyin }
  if (m.xiaohongshu) return { platform: '小红书' as const, profile: m.xiaohongshu }
  return null
}

function entryKey(e: RegistrySupplierTeamLibraryEntry): string {
  return String(e.lingqiTalentId || e.memberId || e.wxNickName || e.id)
    .trim()
    .toLowerCase()
}

function memberToEntry(m: RegistryMpTalentMember, teamType: SupplierTeamRole): RegistrySupplierTeamLibraryEntry {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const primary = primaryPlatform(m)
  const openId = String(m.wxOpenId || '').trim()
  return {
    id: `STL-${teamType}-${m.id}`,
    memberId: m.id,
    lingqiTalentId: m.lingqiTalentId,
    teamType,
    wxNickName: m.wxNickName,
    wxAvatarUrl: m.wxAvatarUrl,
    contact: m.contact,
    wechatId: m.wechatId,
    province: m.province,
    city: m.city,
    platform: primary?.platform,
    platformAccount: primary?.profile.platformAccount,
    platformNickname: primary?.profile.platformNickname,
    accountTags: collectMemberTags(m),
    sourceChannel: openId ? 'mp' : 'web',
    updatedAt: m.updatedAt || now,
  }
}

function dedupeEntries(list: RegistrySupplierTeamLibraryEntry[]) {
  const seen = new Set<string>()
  return list.filter((e) => {
    const k = entryKey(e)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 从 mpTalentMembers 扫描拍摄/剪辑团队并写入注册表团队库 */
export function syncSupplierTeamLibraries(
  data: RegistryFile,
  roles: SupplierTeamRole[] = ['shoot', 'edit'],
): { shootCount: number; editCount: number } {
  const members = data.mpTalentMembers ?? []
  const shootEntries: RegistrySupplierTeamLibraryEntry[] = []
  const editEntries: RegistrySupplierTeamLibraryEntry[] = []

  for (const m of members) {
    const role = memberSupplierRole(m)
    if (role === 'shoot' && roles.includes('shoot')) shootEntries.push(memberToEntry(m, 'shoot'))
    if (role === 'edit' && roles.includes('edit')) editEntries.push(memberToEntry(m, 'edit'))
  }

  if (roles.includes('shoot')) {
    data.shootTeamLibraryEntries = dedupeEntries(shootEntries).slice(0, 5000)
  }
  if (roles.includes('edit')) {
    data.editTeamLibraryEntries = dedupeEntries(editEntries).slice(0, 5000)
  }

  return {
    shootCount: data.shootTeamLibraryEntries?.length ?? 0,
    editCount: data.editTeamLibraryEntries?.length ?? 0,
  }
}
