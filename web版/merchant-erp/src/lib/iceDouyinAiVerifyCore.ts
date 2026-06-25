import type { RegistryMpRecruitmentApplicant, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { verifyApprovedVideoMatchesPublishLink } from './recruitmentPublishLinkMatchCore.js'

export type IceDouyinAiVerifyResult =
  | { passed: true; note: string }
  | { passed: false; note: string }

function resolveIceApprovedVideoUrl(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): string {
  const slotId = String(applicant.assignedIceSlotId || '').trim()
  if (slotId) {
    const slot = (mp.iceVideoSlots ?? []).find((s) => String(s.slotId) === slotId)
    const fromSlot = String(slot?.downloadUrl || slot?.deliverUrl || '').trim()
    if (fromSlot) return fromSlot
  }
  return String(applicant.videoUrl || '').trim()
}

/** 云剪回链 AI 核查：对比分配成片与发布链接作品（画面 + 文案） */
export async function verifyIceDouyinPublishWithAi(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  rawPublishInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<IceDouyinAiVerifyResult> {
  const approvedVideoUrl = resolveIceApprovedVideoUrl(mp, applicant)
  const result = await verifyApprovedVideoMatchesPublishLink({
    approvedVideoUrl,
    rawPublishInput,
    platform: '抖音',
    env,
    mpOrderId: mp.id,
  })
  if (!result.passed) return { passed: false, note: result.note }
  return { passed: true, note: result.note }
}
