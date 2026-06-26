import type { RegistryFile, RegistryMpRecruitmentApplicant } from './opsRegistryTypes.js'
import { dedupeMpOrderApplicants, findDuplicateApplicant, applicantsSamePerson } from './mpApplicantIdentity.js'
import { handleIceMpApply, isIceMpOrder } from './mpRecruitmentIceCore.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'
import { validateRecruitmentClaim } from './mpRecruitApplyGate.js'
import { withSyncedApplicantCount } from './mpRecruitCount.js'
import { checkTalentBlacklistedOnApply } from './mpXingxuanTrustCore.js'

export type ApplyMpRecruitmentResult =
  | { ok: true; data: RegistryFile; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message?: string; code?: string }

export function applyToMpRecruitmentOrderInSnapshot(
  data: RegistryFile,
  mpOrderId: string,
  applicant: RegistryMpRecruitmentApplicant,
  workIdentity?: string | null,
  claimSlotCount?: number | null,
  applyOptions?: { preferredVisitDate?: string },
): ApplyMpRecruitmentResult {
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return { ok: false, status: 404, error: 'not_found' }
  }

  let cur = data.mpRecruitmentOrders[idx]!
  const claimGate = validateRecruitmentClaim(cur, workIdentity)
  if (!claimGate.ok) {
    return {
      ok: false,
      status: 403,
      error: claimGate.code,
      code: claimGate.code,
      message: claimGate.message,
    }
  }
  const platform = cur.platform || '抖音'
  const deduped = dedupeMpOrderApplicants(cur.applicants, platform)
  if (deduped.removedIds.length > 0) {
    cur = { ...cur, applicants: deduped.applicants }
    data.mpRecruitmentOrders[idx] = cur
  }

  const nick = (applicant.platformNickname || applicant.name || '').trim()
  if (!applicant.id || !nick) {
    return { ok: false, status: 400, error: 'invalid_apply' }
  }
  applicant.platformNickname = nick
  applicant.name = nick

  const merchantOrderNo = cur.sourceMerchantOrderId
  const row: RegistryMpRecruitmentApplicant = {
    ...applicant,
    mpOrderId,
    merchantOrderNo,
    claimedSlotCount:
      claimSlotCount != null
        ? Math.max(1, Number.parseInt(String(claimSlotCount), 10) || 1)
        : applicant.claimedSlotCount,
    paymentMethod:
      applicant.paymentMethod ||
      (applicant.alipayAccount ? `支付宝：${applicant.alipayAccount}` : '支付宝'),
  }

  if (isIceMpOrder(cur)) {
    const before = cur.applicants ?? []
    const after = before.filter(
      (a) => !(a?.taskStatus === 'rejected' && applicantsSamePerson(a, row, platform)),
    )
    if (after.length !== before.length) {
      cur = { ...cur, applicants: after }
      data.mpRecruitmentOrders[idx] = cur
    }
  }

  const existingDup = findDuplicateApplicant(cur.applicants, row, platform)
  if (existingDup) {
    if (existingDup.id !== row.id) {
      return {
        ok: false,
        status: 409,
        error: 'already_applied',
        code: 'already_applied',
        message: '您已报名该招募，请勿重复提交',
      }
    }
    if (isIceMpOrder(cur)) {
      const iceResult = handleIceMpApply(cur, { ...row, taskStatus: row.taskStatus ?? 'applied' }, claimSlotCount ?? undefined)
      if (!iceResult.ok) {
        return {
          ok: false,
          status: 409,
          error: iceResult.code ?? 'apply_failed',
          message: iceResult.error,
          code: iceResult.code,
        }
      }
      data.mpRecruitmentOrders[idx] = withSyncedApplicantCount(iceResult.mp)
      const savedApplicant = (iceResult.mp.applicants ?? []).find((a) => a.id === row.id) ?? row
      upsertTalentLibraryFromApplicant(data, {
        platform,
        applicant: savedApplicant,
        mpOrderId,
        merchantOrderNo,
      })
      return { ok: true, data, body: iceResult.body }
    }
    return {
      ok: false,
      status: 409,
      error: 'already_applied',
      code: 'already_applied',
      message: '您已报名该招募，请勿重复提交',
    }
  }

  if (isIceMpOrder(cur)) {
    const iceResult = handleIceMpApply(cur, { ...row, taskStatus: row.taskStatus ?? 'applied' }, claimSlotCount ?? undefined)
    if (!iceResult.ok) {
      return {
        ok: false,
        status: 409,
        error: iceResult.code ?? 'apply_failed',
        message: iceResult.error,
        code: iceResult.code,
      }
    }
    data.mpRecruitmentOrders[idx] = withSyncedApplicantCount(iceResult.mp)
    const savedApplicant = (iceResult.mp.applicants ?? []).find((a) => a.id === row.id) ?? row
    upsertTalentLibraryFromApplicant(data, {
      platform,
      applicant: savedApplicant,
      mpOrderId,
      merchantOrderNo,
    })
    return { ok: true, data, body: iceResult.body }
  }

  const blacklist = checkTalentBlacklistedOnApply(data, cur, row)
  if (blacklist.blocked) {
    return {
      ok: false,
      status: 403,
      error: 'talent_blacklisted',
      code: 'talent_blacklisted',
      message: blacklist.message,
    }
  }

  const applicants = [{ ...row, taskStatus: row.taskStatus ?? 'applied' }, ...(cur.applicants ?? [])]
  data.mpRecruitmentOrders[idx] = withSyncedApplicantCount({
    ...cur,
    applicants: applicants.slice(0, 500),
    status: cur.status === 'open' ? 'collecting' : cur.status,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
  upsertTalentLibraryFromApplicant(data, {
    platform,
    applicant: row,
    mpOrderId,
    merchantOrderNo,
  })
  return { ok: true, data, body: { ok: true, taskStatus: 'applied' } }
}
