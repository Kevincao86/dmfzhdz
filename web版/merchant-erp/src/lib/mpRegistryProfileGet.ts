import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryFile, RegistryMpPrUser, RegistryMpTalentMember } from './opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { memberHasResolvablePlatformInfo } from './mpTalentPlatformProfileResolve.js'
import { enrichMemberFromRegistrySources } from './mpRegistryProfileEnrich.js'
import { registryMemberToClientDraft, registryPrToClientDraft } from './registryMemberClientMap.js'
import {
  ensureMonthlyGiftPointsGranted,
  reconcileAccountPointsBucketsWithLedger,
  resolvePointsLibraryRole,
  resolveRegistryTargetIdForAccount,
} from './mpAiPointsSpendCore.js'
import { normalizeLegacyPointsBucketsOnTarget } from './mpAiPointsBuckets.js'
import { buildMpAiPointsBalanceSummary, type MpAiPointsBalanceSummary } from './mpAiPointsSummary.js'
import {
  resolveEffectiveMembershipTier,
  resolveEffectiveFeatureAccess,
  type MpEffectiveFeatureAccess,
} from './mpMembershipCatalog.js'
import { DEFAULT_PR_FEATURE_ACCESS } from './prFeatureAccess.js'
import {
  buildMembershipAccessRecord,
  resolvePermissionEffectiveMap,
} from './mpMembershipQuota.js'
import {
  ensureDouyinSalesLevelMonthlyReset,
  memberNeedsDouyinSalesLevelUpdate,
} from './mpDouyinSalesLevelMonthlyReset.js'

function accountPhoneKey(account: MpAccountRow): string {
  return String(account.login_name || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function memberPhoneKey(m: RegistryMpTalentMember): string {
  return String(m.contact || m.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function prPhoneKey(u: RegistryMpPrUser): string {
  return String(u.contactPhone || u.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 登录手机号与会员联系方式不一致时，不采纳该绑定（避免共用 LQ-D 绑错人） */
function memberPhoneMatchesAccount(member: RegistryMpTalentMember, phone: string): boolean {
  if (phone.length < 11) return true
  const mPhone = memberPhoneKey(member)
  if (!mPhone) return true
  return mPhone === phone
}

export function findRegistryMemberForAccount(
  data: RegistryFile,
  account: MpAccountRow,
): RegistryMpTalentMember | null {
  const members = data.mpTalentMembers ?? []
  const memberId = String(account.registry_member_id || '').trim()
  const talentId = String(account.lingqi_talent_id || '').trim()
  const openId = String(account.openid || '').trim()
  const phone = accountPhoneKey(account)

  if (memberId) {
    const hit = members.find((m) => m.id === memberId)
    if (hit && memberPhoneMatchesAccount(hit, phone)) return hit
  }
  if (talentId) {
    const hit = members.find((m) => String(m.lingqiTalentId || '').trim() === talentId)
    if (hit && memberPhoneMatchesAccount(hit, phone)) return hit
  }
  if (openId) {
    const hit = members.find((m) => String(m.wxOpenId || '').trim() === openId)
    if (hit && memberPhoneMatchesAccount(hit, phone)) return hit
  }
  if (phone.length >= 11) {
    const hits = members.filter((m) => memberPhoneKey(m) === phone)
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1) {
      if (talentId) {
        const byTalent = hits.find((m) => String(m.lingqiTalentId || '').trim() === talentId)
        if (byTalent) return byTalent
      }
      if (memberId) {
        const byId = hits.find((m) => m.id === memberId)
        if (byId) return byId
      }
      return hits.find((m) => memberHasResolvablePlatformInfo(m)) || hits[0]!
    }
  }
  return null
}

export function findRegistryPrForAccount(
  data: RegistryFile,
  account: MpAccountRow,
): RegistryMpPrUser | null {
  const users = data.mpPrUsers ?? []
  const prId = String(account.registry_pr_id || '').trim()
  const lingqiPrId = String(account.lingqi_pr_id || '').trim()
  const openId = String(account.openid || '').trim()
  const phone = accountPhoneKey(account)

  if (openId) {
    const hit = users.find(
      (u) =>
        String(u.wxOpenId || '').trim() === openId ||
        String(u.platformAccount || '').trim() === openId,
    )
    if (hit) return hit
  }
  if (phone.length >= 11) {
    const hits = users.filter((u) => prPhoneKey(u) === phone)
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1) {
      if (lingqiPrId) {
        const byLq = hits.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId)
        if (byLq) return byLq
      }
      return [...hits].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]!
    }
  }
  if (prId) {
    const hit = users.find((u) => u.id === prId)
    if (hit) return hit
  }
  if (lingqiPrId) {
    const hit = users.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId)
    if (hit) return hit
  }
  return null
}

function storedMembershipPlan(raw: string | null | undefined): string {
  return String(raw ?? '').trim()
}

/**
 * 达人档位与运营台权限详情同一顺序：灵祺达人编号上的会员，否则达人库条目。
 * 登录会话按 registry_member_id 取档，不能再被「手机号不一致」滤成基础版。
 */
export function resolveTalentMembershipForAccount(
  data: RegistryFile,
  account: MpAccountRow,
  phoneSafeMember: RegistryMpTalentMember | null,
): {
  plan: string
  expiresAt?: string
  featureAccess?: RegistryMpTalentMember['mpFeatureAccess']
} {
  const members = data.mpTalentMembers ?? []
  const talentId = String(account.lingqi_talent_id || phoneSafeMember?.lingqiTalentId || '').trim()
  const memberId = String(account.registry_member_id || '').trim()
  const byTalent = talentId
    ? members.find((m) => String(m.lingqiTalentId || '').trim() === talentId)
    : undefined
  const byId = memberId ? members.find((m) => m.id === memberId) : undefined
  const entry = talentId
    ? (data.talentLibraryEntries ?? []).find((e) => String(e.lingqiTalentId || '').trim() === talentId)
    : undefined
  const sources: Array<{
    plan?: string | null
    expiresAt?: string | null
    featureAccess?: RegistryMpTalentMember['mpFeatureAccess']
  } | null> = [
    byTalent
      ? {
          plan: byTalent.mpMembershipPlan,
          expiresAt: byTalent.mpMembershipExpiresAt,
          featureAccess: byTalent.mpFeatureAccess,
        }
      : null,
    byId && byId !== byTalent
      ? {
          plan: byId.mpMembershipPlan,
          expiresAt: byId.mpMembershipExpiresAt,
          featureAccess: byId.mpFeatureAccess,
        }
      : null,
    entry
      ? {
          plan: entry.mpMembershipPlan,
          expiresAt: entry.mpMembershipExpiresAt,
          featureAccess: entry.mpFeatureAccess,
        }
      : null,
    phoneSafeMember && phoneSafeMember !== byTalent && phoneSafeMember !== byId
      ? {
          plan: phoneSafeMember.mpMembershipPlan,
          expiresAt: phoneSafeMember.mpMembershipExpiresAt,
          featureAccess: phoneSafeMember.mpFeatureAccess,
        }
      : null,
  ]
  for (const src of sources) {
    if (!src) continue
    const plan = storedMembershipPlan(src.plan)
    if (!plan) continue
    const expiresAt = String(src.expiresAt || '').trim()
    return {
      plan,
      expiresAt: expiresAt || undefined,
      featureAccess: src.featureAccess,
    }
  }
  return { plan: 'basic', featureAccess: phoneSafeMember?.mpFeatureAccess }
}

/** 当前身份是达人/拍摄/剪辑时用达人会员权限；PR 身份才用 PR 套餐。 */
function usePrFeatureAccess(
  account: MpAccountRow,
  hasPr: boolean,
  hasMember: boolean,
  roleHint?: import('./mpMembershipCatalog.js').MpLibraryRole | null,
): boolean {
  if (roleHint === 'talent' || roleHint === 'shoot' || roleHint === 'edit') return false
  if (roleHint === 'pr') return hasPr
  if (account.active_role === 'pr') return hasPr
  if (hasMember) return false
  return hasPr
}

export async function mpAuthGetRegistryProfile(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
  opts?: { roleHint?: import('./mpMembershipCatalog.js').MpLibraryRole | null },
): Promise<{
  talentMember: Record<string, unknown> | null
  prProfile: Record<string, unknown> | null
  prFeatureAccess: MpEffectiveFeatureAccess
  mpMembershipPlan: string
  mpMembershipPlanEffective: string
  mpMembershipExpired: boolean
  mpMembershipExpiresAt?: string
  mpAiPointsBalance: number
  mpAiPointsSummary: MpAiPointsBalanceSummary
  mpPermissionEffective: Record<string, import('./mpMembershipQuota.js').MpPermissionEffectiveRow>
  douyinSalesLevelNeedsUpdate: boolean
  douyinSalesLevelResetYm: string
}> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const salesReset = ensureDouyinSalesLevelMonthlyReset(data)
  const rawMember = findRegistryMemberForAccount(data, account)
  const member = enrichMemberFromRegistrySources(data, account, rawMember)
  const pr = findRegistryPrForAccount(data, account)
  const accTalentId = String(account.lingqi_talent_id || '').trim()
  const accMemberId = String(account.registry_member_id || '').trim()
  const accPrId = String(account.lingqi_pr_id || '').trim()
  const accRegistryPrId = String(account.registry_pr_id || '').trim()
  const phone = accountPhoneKey(account)
  const boundByMemberId = accMemberId
    ? (data.mpTalentMembers ?? []).find((m) => m.id === accMemberId)
    : null
  const safeAccMemberId =
    boundByMemberId && !memberPhoneMatchesAccount(boundByMemberId, phone) ? '' : accMemberId
  // enrich 已按登录手机号纠偏；优先用 enrich 结果，避免账号上错绑的 LQ-D 覆盖
  const safeAccTalentId = String(member?.lingqiTalentId || accTalentId || '').trim()
  const talentMembership = resolveTalentMembershipForAccount(data, account, member)
  const featureAsPr = usePrFeatureAccess(
    account,
    Boolean(pr),
    Boolean(member) || talentMembership.plan !== 'basic',
    opts?.roleHint,
  )
  let talentMember = member ? registryMemberToClientDraft(member) : null
  if (talentMember && typeof talentMember === 'object') {
    talentMember = {
      ...talentMember,
      // 大厅站内信按 registry 会员 id 匹配；勿用「同 LQ-D 但手机号不同」的错误绑定覆盖
      id: member?.id || safeAccMemberId || talentMember.id,
      lingqiTalentId: safeAccTalentId || talentMember.lingqiTalentId,
      mpMembershipPlan: featureAsPr
        ? member?.mpMembershipPlan || 'basic'
        : talentMembership.plan,
      mpMembershipExpiresAt: featureAsPr
        ? member?.mpMembershipExpiresAt
        : talentMembership.expiresAt,
    }
  }
  let prProfile = pr ? registryPrToClientDraft(pr) : null
  if (pr && prProfile && typeof prProfile === 'object') {
    prProfile = {
      ...prProfile,
      id: String(pr.id || prProfile.id || accRegistryPrId || ''),
      lingqiPrId: String(pr.lingqiPrId || accPrId || prProfile.lingqiPrId || ''),
      mpMembershipPlan: pr.mpMembershipPlan || 'basic',
      mpMembershipExpiresAt: pr.mpMembershipExpiresAt,
    }
  }
  const mpMembershipPlan = featureAsPr
    ? String(pr?.mpMembershipPlan || 'basic').trim() || 'basic'
    : talentMembership.plan
  const mpMembershipExpiresAt = featureAsPr
    ? pr?.mpMembershipExpiresAt
    : talentMembership.expiresAt || member?.mpMembershipExpiresAt
  const mpMembershipPlanEffective = resolveEffectiveMembershipTier(mpMembershipPlan, mpMembershipExpiresAt)
  const mpMembershipExpired =
    mpMembershipPlanEffective === 'basic' && mpMembershipPlan !== 'basic' && Boolean(String(mpMembershipExpiresAt || '').trim())
  let registryDirty = false
  const pointsRole = resolvePointsLibraryRole(data, account, opts)
  const pointsTarget = resolveRegistryTargetIdForAccount(data, account, pointsRole)
  if (pointsTarget && normalizeLegacyPointsBucketsOnTarget(data, pointsRole, pointsTarget)) {
    registryDirty = true
  }
  const gift = ensureMonthlyGiftPointsGranted(data, account, { roleHint: pointsRole })
  // 先按流水纠偏双桶，再统一用 summary.balance 作为「当前余额」
  const reconciled = reconcileAccountPointsBucketsWithLedger(data, account, { roleHint: pointsRole })
  const mpAiPointsSummary = buildMpAiPointsBalanceSummary(data, account, { roleHint: pointsRole })
  const mpAiPointsBalance = Math.max(0, Math.floor(Number(mpAiPointsSummary.balance) || 0))
  if (gift.granted > 0 || registryDirty || salesReset.changed || reconciled) {
    await io.save(data)
  }
  const memberAfterReset = findRegistryMemberForAccount(data, account)
  const douyinSalesLevelResetYm = salesReset.resetYm
  const douyinSalesLevelNeedsUpdate = memberNeedsDouyinSalesLevelUpdate(
    memberAfterReset,
    douyinSalesLevelResetYm,
  )
  const libRole = featureAsPr ? 'pr' : 'talent'
  const accessRecord = featureAsPr
    ? buildMembershipAccessRecord('pr', pr)
    : buildMembershipAccessRecord('talent', {
        ...(member ?? {}),
        mpMembershipPlan: talentMembership.plan as RegistryMpTalentMember['mpMembershipPlan'],
        mpMembershipExpiresAt: talentMembership.expiresAt,
        mpFeatureAccess: talentMembership.featureAccess ?? member?.mpFeatureAccess,
      } as RegistryMpTalentMember)
  const usageEntity = featureAsPr ? pr ?? member ?? null : member ?? pr ?? null
  const mpPermissionEffective = resolvePermissionEffectiveMap(libRole, accessRecord, data, usageEntity)
  const prFeatureAccess = featureAsPr
    ? pr
      ? resolveEffectiveFeatureAccess(
          'pr',
          {
            mpMembershipPlan: pr.mpMembershipPlan,
            mpMembershipExpiresAt: pr.mpMembershipExpiresAt,
            prFeatureAccess: pr.prFeatureAccess,
          },
          data,
        )
      : { ...DEFAULT_PR_FEATURE_ACCESS }
    : resolveEffectiveFeatureAccess(
        'talent',
        {
          mpMembershipPlan: talentMembership.plan,
          mpMembershipExpiresAt: talentMembership.expiresAt,
          mpFeatureAccess: talentMembership.featureAccess ?? member?.mpFeatureAccess,
        },
        data,
      )
  return {
    talentMember,
    prProfile,
    prFeatureAccess,
    mpMembershipPlan,
    mpMembershipPlanEffective,
    mpMembershipExpired,
    mpMembershipExpiresAt,
    mpAiPointsBalance,
    mpAiPointsSummary,
    mpPermissionEffective,
    douyinSalesLevelNeedsUpdate,
    douyinSalesLevelResetYm,
  }
}
