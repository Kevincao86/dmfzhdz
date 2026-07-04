const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const clientStateGuard = require('./mpClientStateGuard.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const wxProfileDisplay = require('./wxProfileDisplay.js')
const prFeatureAccess = require('./prFeatureAccess.js')
const mpBillingRoleHint = require('./mpBillingRoleHint.js')

function digits11(raw) {
  const d = String(raw == null ? '' : raw).replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

function enforceLoginPhone(draft, account) {
  const phone = digits11(account && account.loginName)
  if (!phone) return draft
  const next = { ...draft }
  if (!digits11(next.contact)) next.contact = phone
  if (!digits11(next.wechatId)) next.wechatId = phone
  return next
}

/** 云端拉取时保留本机已填、注册表尚未回写的字段（如历史缺 gender 映射） */
function mergeTalentMemberDraft(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  const merged = {
    ...local,
    ...remote,
    gender: String(remote.gender || local.gender || '').trim(),
    alipayAccount: String(remote.alipayAccount || local.alipayAccount || '').trim(),
    contact: String(remote.contact || local.contact || '').trim(),
    wechatId: String(remote.wechatId || local.wechatId || '').trim(),
    province: String(remote.province || local.province || '').trim(),
    city: String(remote.city || local.city || '').trim(),
    platformProfiles: {
      ...(local.platformProfiles && typeof local.platformProfiles === 'object' ? local.platformProfiles : {}),
      ...(remote.platformProfiles && typeof remote.platformProfiles === 'object' ? remote.platformProfiles : {}),
    },
  }
  return talentPlatforms.migrateMember(merged)
}

async function pullRegistryProfileAfterLogin() {
  let account = sessionStore.readAccount()
  const token = sessionStore.readSessionToken()
  if (!account || !token) return false
  try {
    const data = await ecs.post(
      '/api/meoo-ops-mp-auth',
      { action: 'registry_profile_get', ...mpBillingRoleHint.billingRolePayload() },
      { 'X-Mp-Session': token },
    )
    if (!data || data.ok === false) return false
    let applied = false
    const mpMembershipPlan = String(data.mpMembershipPlan || 'basic').trim() || 'basic'
    const mpMembershipExpiresAt = String(data.mpMembershipExpiresAt || '').trim()
    const mpAiPointsBalance = Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0))
    let nextAccount = account
    if (data.prFeatureAccess && typeof data.prFeatureAccess === 'object') {
      nextAccount = prFeatureAccess.patchAccountPrFeatureAccess(nextAccount, data.prFeatureAccess)
      applied = true
    }
    const accountPatch = {}
    if (
      mpMembershipPlan !== String(nextAccount.mpMembershipPlan || 'basic').trim() ||
      (mpMembershipExpiresAt &&
        mpMembershipExpiresAt !== String(nextAccount.mpMembershipExpiresAt || '').trim())
    ) {
      accountPatch.mpMembershipPlan = mpMembershipPlan
      if (mpMembershipExpiresAt) accountPatch.mpMembershipExpiresAt = mpMembershipExpiresAt
    }
    if (mpAiPointsBalance !== Math.max(0, Math.floor(Number(nextAccount.mpAiPointsBalance) || 0))) {
      accountPatch.mpAiPointsBalance = mpAiPointsBalance
    }
    if (
      data.prProfile &&
      typeof data.prProfile === 'object' &&
      clientStateGuard.prDraftBelongsToAccount(data.prProfile, account)
    ) {
      const serverPrId = String(data.prProfile.id || '').trim()
      const serverLqPrId = String(data.prProfile.lingqiPrId || '').trim()
      if (serverPrId && serverPrId !== String(nextAccount.registryPrId || '').trim()) {
        accountPatch.registryPrId = serverPrId
      }
      if (serverLqPrId && serverLqPrId !== String(nextAccount.lingqiPrId || '').trim()) {
        accountPatch.lingqiPrId = serverLqPrId
      }
    }
    if (
      data.talentMember &&
      typeof data.talentMember === 'object' &&
      clientStateGuard.talentDraftBelongsToAccount(data.talentMember, account)
    ) {
      const serverMemberId = String(data.talentMember.id || '').trim()
      const serverTalentId = String(data.talentMember.lingqiTalentId || '').trim()
      if (serverMemberId && serverMemberId !== String(nextAccount.registryMemberId || '').trim()) {
        accountPatch.registryMemberId = serverMemberId
      }
      if (serverTalentId && serverTalentId !== String(nextAccount.lingqiTalentId || '').trim()) {
        accountPatch.lingqiTalentId = serverTalentId
      }
    }
    if (Object.keys(accountPatch).length > 0) {
      nextAccount = { ...nextAccount, ...accountPatch }
      applied = true
    }
    if (applied && nextAccount !== account) {
      sessionStore.writeSessionPair(token, nextAccount)
      account = nextAccount
    }
    if (
      data.talentMember &&
      typeof data.talentMember === 'object' &&
      clientStateGuard.talentDraftBelongsToAccount(data.talentMember, account)
    ) {
      const patched = enforceLoginPhone(data.talentMember, account)
      const migrated = mergeTalentMemberDraft(memberStore.readMember(), patched)
      memberStore.writeMember({
        ...migrated,
        id: String(migrated.id || account.registryMemberId || '').trim(),
        lingqiTalentId: String(account.lingqiTalentId || migrated.lingqiTalentId || '').trim(),
        lingqiShootTeamId: String(account.lingqiShootTeamId || migrated.lingqiShootTeamId || '').trim(),
        lingqiEditTeamId: String(account.lingqiEditTeamId || migrated.lingqiEditTeamId || '').trim(),
        mpMembershipPlan: String(
          data.talentMember.mpMembershipPlan || migrated.mpMembershipPlan || mpMembershipPlan,
        ).trim() || 'basic',
        mpMembershipExpiresAt: String(
          data.talentMember.mpMembershipExpiresAt ||
            migrated.mpMembershipExpiresAt ||
            mpMembershipExpiresAt ||
            '',
        ).trim(),
        wxNickName: wxProfileDisplay.pickWxNick(account.wxNickName, migrated.wxNickName),
        wxAvatarUrl: wxProfileDisplay.pickWxAvatar(account.wxAvatarUrl, migrated.wxAvatarUrl),
        wxOpenId: String(account.openid || migrated.wxOpenId || '').trim(),
      })
      applied = true
    }
    if (
      data.prProfile &&
      typeof data.prProfile === 'object' &&
      clientStateGuard.prDraftBelongsToAccount(data.prProfile, account)
    ) {
      const base = { ...userProfile.emptyPrProfile(), ...data.prProfile }
      userProfile.writePrProfile({
        ...base,
        id: String(data.prProfile.id || account.registryPrId || base.id || '').trim(),
        lingqiPrId: String(data.prProfile.lingqiPrId || account.lingqiPrId || base.lingqiPrId || '').trim(),
        mpMembershipPlan: String(
          data.prProfile.mpMembershipPlan || base.mpMembershipPlan || mpMembershipPlan,
        ).trim() || 'basic',
        mpMembershipExpiresAt: String(
          data.prProfile.mpMembershipExpiresAt || base.mpMembershipExpiresAt || mpMembershipExpiresAt || '',
        ).trim(),
        wxNickName: wxProfileDisplay.pickWxNick(account.wxNickName, base.wxNickName),
        wxAvatarUrl: wxProfileDisplay.pickWxAvatar(account.wxAvatarUrl, base.wxAvatarUrl),
        wxOpenId: String(account.openid || base.wxOpenId || '').trim(),
      })
      applied = true
    }
    try {
      require('./douyinSalesLevelMonthlyPrompt.js').maybeShowAfterProfileSync({
        serverNeedsUpdate: data.douyinSalesLevelNeedsUpdate === true,
        resetYm: String(data.douyinSalesLevelResetYm || '').trim(),
      })
    } catch (_) {}
    return applied
  } catch (e) {
    console.warn('[mp] registry_profile_get', String(e && e.message ? e.message : e).slice(0, 120))
    return false
  }
}

module.exports = {
  pullRegistryProfileAfterLogin,
}
