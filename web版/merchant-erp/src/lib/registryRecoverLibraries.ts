/**
 * 从 mp_accounts、client_state 草稿、招募单 applicants 重建达人/PR/团队库。
 * 用于 ops_registry_snapshot 被部分覆盖后的紧急恢复（不删除已有订单/租户/Key）。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import type { MpClientStatePayload } from './mpAccountClientStateMerge.js'
import type {
  RegistryFile,
  RegistryMpPrUser,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
} from './opsRegistryTypes.js'
import { dedupeMpPrUsersByOpenId, upsertMpPrUser } from './mpPrUserUpsert.js'
import { dedupeMpTalentMembersByOpenId, upsertMpTalentMember } from './mpTalentMemberUpsert.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'
import { syncSupplierTeamLibraries } from './supplierTeamLibrarySync.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'

export type RegistryRecoverCounts = {
  mpAccounts: number
  clientStates: number
  membersBefore: number
  membersAfter: number
  prBefore: number
  prAfter: number
  talentLibBefore: number
  talentLibAfter: number
  shootTeamAfter: number
  editTeamAfter: number
  applicantsScanned: number
  ordersScanned: number
}

type AccountWithState = {
  account: MpAccountRow
  state: MpClientStatePayload
}

function nowCn(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function phoneFromLogin(loginName: string | null | undefined): string {
  const digits = String(loginName || '')
    .replace(/\D/g, '')
    .slice(-11)
  return digits.length >= 11 ? digits : ''
}

function asMemberDraft(raw: unknown): Partial<RegistryMpTalentMember> | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const memberType = d.memberType
  if (memberType !== 'douyin' && memberType !== 'xiaohongshu' && memberType !== 'both') return null
  return d as Partial<RegistryMpTalentMember>
}

function asPrDraft(raw: unknown): Partial<RegistryMpPrUser> | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (!String(d.lingqiPrId || d.contactPhone || d.personalName || d.companyName || '').trim()) {
    return null
  }
  return d as Partial<RegistryMpPrUser>
}

function memberFromAccount(account: MpAccountRow, draft?: Partial<RegistryMpTalentMember> | null): RegistryMpTalentMember {
  const now = nowCn()
  const phone = phoneFromLogin(account.login_name)
  const openId = String(account.openid || '').trim()
  const base: RegistryMpTalentMember = {
    id: String(account.registry_member_id || draft?.id || `MTM-${account.id.slice(0, 8)}`).trim(),
    lingqiTalentId: String(account.lingqi_talent_id || draft?.lingqiTalentId || '').trim() || undefined,
    memberType: draft?.memberType || 'douyin',
    wxNickName: String(draft?.wxNickName || account.wx_nick_name || '微信用户').trim() || '微信用户',
    wxAvatarUrl: String(draft?.wxAvatarUrl || account.wx_avatar_url || '').trim(),
    wxOpenId: openId || draft?.wxOpenId,
    contact: String(draft?.contact || phone || '').trim(),
    wechatId: String(draft?.wechatId || phone || '').trim(),
    province: draft?.province,
    city: draft?.city,
    workIdentity: draft?.workIdentity,
    lingqiShootTeamId: draft?.lingqiShootTeamId,
    lingqiEditTeamId: draft?.lingqiEditTeamId,
    accountTags: draft?.accountTags,
    supplierProfile: draft?.supplierProfile,
    douyin: draft?.douyin,
    xiaohongshu: draft?.xiaohongshu,
    platformProfiles: draft?.platformProfiles,
    alipayAccount: draft?.alipayAccount,
    gender: draft?.gender,
    registeredAt: String(draft?.registeredAt || now).trim() || now,
    updatedAt: now,
  }
  return base
}

function prFromAccount(account: MpAccountRow, draft?: Partial<RegistryMpPrUser> | null): RegistryMpPrUser {
  const now = nowCn()
  const phone = phoneFromLogin(account.login_name)
  const openId = String(account.openid || '').trim()
  return {
    id: String(account.registry_pr_id || draft?.id || `MPR-${account.id.slice(0, 8)}`).trim(),
    lingqiPrId: String(account.lingqi_pr_id || draft?.lingqiPrId || '').trim(),
    accountType: draft?.accountType === 'company' ? 'company' : 'personal',
    companyName: draft?.companyName,
    personalName: draft?.personalName,
    contactName: draft?.contactName,
    contactPhone: String(draft?.contactPhone || phone || '').trim(),
    wechatId: String(draft?.wechatId || phone || '').trim(),
    province: draft?.province,
    city: draft?.city,
    intro: draft?.intro,
    wxNickName: String(draft?.wxNickName || account.wx_nick_name || '').trim(),
    wxAvatarUrl: String(draft?.wxAvatarUrl || account.wx_avatar_url || '').trim(),
    wxOpenId: openId || draft?.wxOpenId,
    platformAccount: openId || phone || draft?.platformAccount,
    sourceChannel: openId ? 'mp' : draft?.sourceChannel || 'web',
    registeredAt: String(draft?.registeredAt || now).trim() || now,
    updatedAt: now,
  }
}

function recoverMembersAndPr(data: RegistryFile, rows: AccountWithState[]): void {
  for (const { account, state } of rows) {
    const talentDraft = asMemberDraft(state.talentMemberDraft)
    const prDraft = asPrDraft(state.prProfileDraft)
    const hasTalent =
      account.active_role === 'talent' ||
      Boolean(account.lingqi_talent_id || account.registry_member_id || talentDraft)
    const hasPr =
      account.active_role === 'pr' ||
      Boolean(account.lingqi_pr_id || account.registry_pr_id || prDraft)

    if (hasTalent) {
      const member = memberFromAccount(account, talentDraft)
      upsertMpTalentMember(data, member)
      const openId = String(member.wxOpenId || account.openid || '').trim()
      if (openId) dedupeMpTalentMembersByOpenId(data, openId, member.id)
    }
    if (hasPr) {
      const pr = prFromAccount(account, prDraft)
      if (String(pr.lingqiPrId || pr.contactPhone || pr.personalName || pr.companyName || '').trim()) {
        upsertMpPrUser(data, pr)
        const openId = String(pr.wxOpenId || account.openid || '').trim()
        if (openId) dedupeMpPrUsersByOpenId(data, openId, pr.id)
      }
    }
  }
}

function applicantPlatform(order: RegistryMpRecruitmentOrder, applicant: RegistryMpRecruitmentApplicant): string {
  const fromApplicant = normalizeRecruitmentPlatform(String(applicant.platform || '').trim())
  if (fromApplicant) return fromApplicant
  return normalizeRecruitmentPlatform(String(order.platform || '抖音').trim()) || '抖音'
}

function recoverTalentLibraryFromOrders(data: RegistryFile): { ordersScanned: number; applicantsScanned: number } {
  const orders = data.mpRecruitmentOrders ?? []
  let applicantsScanned = 0
  for (const order of orders) {
    const applicants = order.applicants ?? []
    for (const raw of applicants) {
      if (!raw || typeof raw !== 'object') continue
      const applicant = raw as RegistryMpRecruitmentApplicant
      const account = String(applicant.platformAccount || '').trim()
      if (!account) continue
      applicantsScanned += 1
      const platform = applicantPlatform(order, applicant)
      const lq = findLingqiTalentIdForApplicant(data, applicant)
      upsertTalentLibraryFromApplicant(data, {
        platform,
        applicant,
        mpOrderId: String(order.id || ''),
        merchantOrderNo: String(order.sourceMerchantOrderId || ''),
        lingqiTalentId: lq,
      })
    }
  }
  return { ordersScanned: orders.length, applicantsScanned }
}

function findLingqiTalentIdForApplicant(
  data: RegistryFile,
  applicant: RegistryMpRecruitmentApplicant,
): string | undefined {
  const phone = String(applicant.contact || applicant.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
  for (const m of data.mpTalentMembers ?? []) {
    const mp = String(m.contact || m.wechatId || '')
      .replace(/\D/g, '')
      .slice(-11)
    if (phone.length >= 11 && mp === phone && m.lingqiTalentId) return m.lingqiTalentId
    if (String(m.wxNickName || '').trim() && m.wxNickName === applicant.name && m.lingqiTalentId) {
      return m.lingqiTalentId
    }
  }
  return undefined
}

/** 保留已有库条目，仅从账号/订单补全缺失部分 */
export function recoverRegistryLibraries(
  data: RegistryFile,
  rows: AccountWithState[],
): RegistryRecoverCounts {
  const before = {
    members: (data.mpTalentMembers ?? []).length,
    pr: (data.mpPrUsers ?? []).length,
    talentLib: (data.talentLibraryEntries ?? []).length,
  }

  recoverMembersAndPr(data, rows)
  const orderScan = recoverTalentLibraryFromOrders(data)

  for (const m of [...(data.mpTalentMembers ?? [])]) {
    upsertMpTalentMember(data, m)
  }
  const team = syncSupplierTeamLibraries(data, ['shoot', 'edit'])

  return {
    mpAccounts: rows.length,
    clientStates: rows.filter((r) => Object.keys(r.state || {}).length > 1).length,
    membersBefore: before.members,
    membersAfter: (data.mpTalentMembers ?? []).length,
    prBefore: before.pr,
    prAfter: (data.mpPrUsers ?? []).length,
    talentLibBefore: before.talentLib,
    talentLibAfter: (data.talentLibraryEntries ?? []).length,
    shootTeamAfter: team.shootCount,
    editTeamAfter: team.editCount,
    applicantsScanned: orderScan.applicantsScanned,
    ordersScanned: orderScan.ordersScanned,
  }
}

type SupabaseRest = {
  get: (path: string) => Promise<Response>
}

function restClient(supabaseUrl: string, serviceRole: string): SupabaseRest {
  const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: 'application/json',
  }
  return {
    get: (path) => fetch(`${base}${path}`, { headers }),
  }
}

export async function fetchAccountsWithClientState(
  supabaseUrl: string,
  serviceRole: string,
): Promise<AccountWithState[]> {
  const rest = restClient(supabaseUrl, serviceRole)
  const accRes = await rest.get(
    '/mp_accounts?select=id,openid,login_name,active_role,lingqi_talent_id,lingqi_pr_id,registry_member_id,registry_pr_id,wx_nick_name,wx_avatar_url&order=updated_at.desc&limit=5000',
  )
  if (!accRes.ok) {
    const t = await accRes.text().catch(() => '')
    throw new Error(`mp_accounts_fetch_${accRes.status}:${t.slice(0, 200)}`)
  }
  const accounts = (await accRes.json()) as MpAccountRow[]

  const stateRes = await rest.get(
    '/mp_account_client_state?select=account_id,payload&limit=5000',
  )
  const stateMap = new Map<string, MpClientStatePayload>()
  if (stateRes.ok) {
    const states = (await stateRes.json()) as { account_id?: string; payload?: unknown }[]
    for (const row of states) {
      const id = String(row.account_id || '').trim()
      if (!id) continue
      const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as MpClientStatePayload
      stateMap.set(id, payload)
    }
  }

  return accounts.map((account) => ({
    account,
    state: stateMap.get(account.id) ?? {},
  }))
}
