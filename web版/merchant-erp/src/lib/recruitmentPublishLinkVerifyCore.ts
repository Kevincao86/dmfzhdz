import type { RegistryMpRecruitmentApplicant, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { verifyApprovedVideoMatchesPublishLink } from './recruitmentPublishLinkMatchCore.js'

export type PublishLinkVerifyResult =
  | { passed: true; note: string; normalizedUrl: string }
  | { passed: false; note: string }

function resolveRecruitPlatform(
  mp: RegistryMpRecruitmentOrder,
  applicant?: RegistryMpRecruitmentApplicant | null,
): string {
  return String(applicant?.platform || mp.platform || '抖音').trim() || '抖音'
}

/** 探店招募：达人回传平台发布链接后，对比审核通过成片与发布作品（画面 + 文案） */
export async function verifyRecruitmentPublishWithAi(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant | null | undefined,
  rawPublishInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
  opts?: { sampleMode?: 'opening' | 'full' },
): Promise<PublishLinkVerifyResult> {
  const approvedVideoUrl = String(applicant?.videoUrl || '').trim()
  const platform = resolveRecruitPlatform(mp, applicant)
  return verifyApprovedVideoMatchesPublishLink({
    approvedVideoUrl,
    rawPublishInput,
    platform,
    env,
    mpOrderId: mp.id,
    sampleMode: opts?.sampleMode,
  })
}
