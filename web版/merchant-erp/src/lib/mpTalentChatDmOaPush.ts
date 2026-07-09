import { canonicalTalentMemberIdFromRegistry } from './mpTalentChatAliases.js'
import type { MpChatDb, MpChatRole } from './mpTalentChatSupabase.js'
import { readSessionByIdAdmin } from './mpTalentChatSupabase.js'
import { oaOpenIdForTalentMember } from './mpWechatOaBindingCore.js'
import { wechatOaDmPushConfigured } from './mpWechatOfficialAccountConfig.js'
import { sendWechatOaDmUnreadTemplate } from './mpWechatOfficialAccountSend.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'

const RATE_LIMIT_MS = 10 * 60 * 1000
const recentPushes = new Map<string, number>()

function rateLimitKey(sessionId: string, oaOpenId: string): string {
  return `${sessionId}:${oaOpenId}`
}

function tryAcquireRateLimit(key: string): boolean {
  const now = Date.now()
  const last = recentPushes.get(key) || 0
  if (now - last < RATE_LIMIT_MS) return false
  recentPushes.set(key, now)
  if (recentPushes.size > 5000) {
    for (const [k, t] of recentPushes) {
      if (now - t > RATE_LIMIT_MS) recentPushes.delete(k)
    }
  }
  return true
}

function talentMemberIdFromTalentKey(talentKey: string, reg: RegistrySnapshot | null): string {
  const raw = String(talentKey || '').replace(/^talent_/, '').trim()
  if (!raw) return ''
  if (reg) {
    const canonical = canonicalTalentMemberIdFromRegistry(reg, raw)
    if (canonical) return canonical
  }
  return raw
}

/** PR 发私信后，向已绑定服务号的达人推送未读提醒（失败不影响私信发送） */
export async function pushOaDmUnreadAfterChatMessage(
  sb: MpChatDb,
  opts: {
    sessionId: string
    fromRole: MpChatRole
    supabaseUrl: string
    serviceRole: string
  },
): Promise<void> {
  if (!wechatOaDmPushConfigured()) return
  if (opts.fromRole !== 'pr') return

  const session = await readSessionByIdAdmin(sb, opts.sessionId)
  if (!session) return

  let reg: RegistrySnapshot | null = null
  try {
    const io = createRegistrySnapshotIoFetch(opts.supabaseUrl, opts.serviceRole)
    reg = await io.load()
  } catch {
    return
  }
  if (!reg) return

  const talentMemberId = talentMemberIdFromTalentKey(session.talent_key, reg)
  if (!talentMemberId) return

  const oaOpenId = oaOpenIdForTalentMember(reg, talentMemberId)
  if (!oaOpenId) return

  const rlKey = rateLimitKey(opts.sessionId, oaOpenId)
  if (!tryAcquireRateLimit(rlKey)) return

  const senderName = String(session.pr_name || '').trim() || '招募方'
  await sendWechatOaDmUnreadTemplate({
    oaOpenId,
    senderName,
    sessionId: opts.sessionId,
    hintText: '您有未读私信请查看',
  })
}
