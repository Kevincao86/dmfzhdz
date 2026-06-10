import type { RegistryMpRecruitmentApplicant, RegistrySnapshot } from './opsRegistryTypes.js'

const PLATFORM_IDS: { id: string; names: string[] }[] = [
  { id: 'douyin', names: ['抖音'] },
  { id: 'xiaohongshu', names: ['小红书'] },
  { id: 'kuaishou', names: ['快手'] },
  { id: 'dianping', names: ['大众点评', '点评'] },
  { id: 'weixin_video', names: ['微信视频号', '视频号'] },
]

function platformIdFromName(name: string): string {
  const n = String(name || '').trim()
  for (const p of PLATFORM_IDS) {
    if (p.names.some((label) => n.includes(label))) return p.id
  }
  return 'douyin'
}

function parseAppliedAtMs(applicant: RegistryMpRecruitmentApplicant): number {
  const t = Date.parse(String(applicant.appliedAt || '').trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function contactKey(contact: unknown): string {
  const digits = String(contact || '').replace(/\D/g, '')
  return digits.length >= 7 ? `contact:${digits.slice(-11)}` : ''
}

function accountKey(platform: string, account: unknown): string {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  return `acct:${platformIdFromName(platform)}:${a}`
}

/** 同一达人跨字段可匹配的标识键（任一命中即视为同一人） */
export function applicantIdentityKeys(
  applicant: RegistryMpRecruitmentApplicant,
  orderPlatform = '抖音',
): string[] {
  const keys = new Set<string>()
  const wxOpenId = String((applicant as { wxOpenId?: string }).wxOpenId || '').trim()
  if (wxOpenId) keys.add(`wx:${wxOpenId}`)
  const talentMemberId = String(applicant.talentMemberId || '').trim()
  if (talentMemberId) keys.add(`tm:${talentMemberId}`)
  const ck = contactKey(applicant.contact)
  if (ck) keys.add(ck)
  const wechat = String(applicant.wechatId || '').trim().toLowerCase()
  if (wechat) keys.add(`wechat:${wechat}`)
  const plat = String(applicant.platform || orderPlatform || '抖音')
  const ak = accountKey(plat, applicant.platformAccount)
  if (ak) keys.add(ak)
  return [...keys]
}

export function applicantsSamePerson(
  a: RegistryMpRecruitmentApplicant,
  b: RegistryMpRecruitmentApplicant,
  orderPlatform?: string,
): boolean {
  const ka = applicantIdentityKeys(a, orderPlatform)
  const kb = applicantIdentityKeys(b, orderPlatform)
  if (!ka.length || !kb.length) return false
  return ka.some((k) => kb.includes(k))
}

export function findDuplicateApplicant(
  applicants: RegistryMpRecruitmentApplicant[] | undefined,
  incoming: RegistryMpRecruitmentApplicant,
  orderPlatform: string,
): RegistryMpRecruitmentApplicant | null {
  for (const a of applicants ?? []) {
    if (!a) continue
    if (a.id && incoming.id && a.id === incoming.id) return a
    if (applicantsSamePerson(a, incoming, orderPlatform)) return a
  }
  return null
}

function pickKeeperFromCluster(cluster: RegistryMpRecruitmentApplicant[]): RegistryMpRecruitmentApplicant {
  const selected = cluster.find((a) => a.prSelected === true)
  if (selected) return selected
  return cluster.reduce((best, a) => {
    const bt = parseAppliedAtMs(best)
    const at = parseAppliedAtMs(a)
    if (at <= 0 && bt > 0) return best
    if (bt <= 0 && at > 0) return a
    if (at < bt) return a
    if (at > bt) return best
    return String(a.id || '') < String(best.id || '') ? a : best
  })
}

/** 同一招募单内按身份去重，保留最早报名（PR 已选优先） */
export function dedupeMpOrderApplicants(
  applicants: RegistryMpRecruitmentApplicant[] | undefined,
  orderPlatform: string,
): { applicants: RegistryMpRecruitmentApplicant[]; removedIds: string[] } {
  const list = (applicants ?? []).filter(Boolean)
  if (list.length <= 1) return { applicants: list, removedIds: [] }

  const clusters: RegistryMpRecruitmentApplicant[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < list.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [list[i]!]
    assigned.add(i)
    for (let j = i + 1; j < list.length; j++) {
      if (assigned.has(j)) continue
      if (applicantsSamePerson(list[i]!, list[j]!, orderPlatform)) {
        cluster.push(list[j]!)
        assigned.add(j)
      }
    }
    clusters.push(cluster)
  }

  const keepers = new Set<string>()
  const removedIds: string[] = []
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      keepers.add(String(cluster[0]!.id))
      continue
    }
    const keeper = pickKeeperFromCluster(cluster)
    keepers.add(String(keeper.id))
    for (const a of cluster) {
      if (String(a.id) !== String(keeper.id)) removedIds.push(String(a.id))
    }
  }

  return {
    applicants: list.filter((a) => keepers.has(String(a.id))),
    removedIds,
  }
}

/** 注册表加载时清理各单重复报名（异步持久化） */
export function syncDedupeApplicantsInSnapshot(
  data: RegistrySnapshot,
): { syncedOrderIds: string[]; removedCount: number } {
  const syncedOrderIds: string[] = []
  let removedCount = 0
  for (const mp of data.mpRecruitmentOrders ?? []) {
    if (!mp?.id) continue
    const platform = mp.platform || '抖音'
    const deduped = dedupeMpOrderApplicants(mp.applicants, platform)
    if (deduped.removedIds.length > 0) {
      mp.applicants = deduped.applicants
      syncedOrderIds.push(String(mp.id))
      removedCount += deduped.removedIds.length
    }
  }
  return { syncedOrderIds, removedCount }
}
