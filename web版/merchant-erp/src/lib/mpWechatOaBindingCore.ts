import { randomBytes } from 'node:crypto'
import type { RegistryMpTalentMember, RegistrySnapshot } from './opsRegistryTypes.js'
import { getWechatOfficialAccountAccessToken } from './mpWechatOfficialAccountAccess.js'
import { loadWechatOaConfig, normalizeWechatOaApiError } from './mpWechatOfficialAccountConfig.js'

export type RegistryMpWechatOaBindTicket = {
  ticket: string
  talentMemberId: string
  createdAt: string
  expiresAt: string
  status: 'pending' | 'bound' | 'expired'
  oaOpenId?: string
  boundAt?: string
}

const TICKET_TTL_MS = 30 * 60 * 1000
const SCENE_MAX = 64

function nowCn(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function newTicketId(): string {
  return `bt_${randomBytes(12).toString('hex')}`
}

function pruneTickets(data: RegistrySnapshot): RegistryMpWechatOaBindTicket[] {
  const now = Date.now()
  const list = Array.isArray(data.mpWechatOaBindTickets) ? [...data.mpWechatOaBindTickets] : []
  return list.filter((t) => {
    if (!t || !t.ticket) return false
    if (t.status === 'bound') return true
    const exp = Date.parse(String(t.expiresAt || '').replace(/-/g, '/'))
    return Number.isFinite(exp) && exp > now
  })
}

function findMember(data: RegistrySnapshot, talentMemberId: string): RegistryMpTalentMember | null {
  const id = String(talentMemberId || '').trim()
  if (!id) return null
  for (const m of data.mpTalentMembers ?? []) {
    if (!m) continue
    if (String(m.id) === id) return m
    if (m.lingqiTalentId && String(m.lingqiTalentId) === id) return m
  }
  return null
}

export function oaOpenIdForTalentMember(data: RegistrySnapshot, talentMemberId: string): string {
  const id = String(talentMemberId || '').trim()
  if (!id) return ''
  const member = findMember(data, id)
  const fromMember = String(member?.wxOaOpenId || '').trim()
  if (fromMember) return fromMember
  const bindings = Array.isArray(data.mpWechatOaBindings) ? data.mpWechatOaBindings : []
  const hit = bindings.find((b) => b && b.active !== false && String(b.talentMemberId) === id)
  return String(hit?.oaOpenId || '').trim()
}

export function wechatOaBindStatusInSnapshot(
  data: RegistrySnapshot,
  talentMemberId: string,
): { bound: boolean; oaOpenId?: string; boundAt?: string } {
  const oaOpenId = oaOpenIdForTalentMember(data, talentMemberId)
  if (!oaOpenId) return { bound: false }
  const bindings = Array.isArray(data.mpWechatOaBindings) ? data.mpWechatOaBindings : []
  const hit = bindings.find(
    (b) => b && b.active !== false && String(b.talentMemberId) === String(talentMemberId || '').trim(),
  )
  return { bound: true, oaOpenId, boundAt: hit?.boundAt }
}

export async function createWechatOaBindTicketInSnapshot(
  data: RegistrySnapshot,
  talentMemberId: string,
): Promise<
  | { ok: true; ticket: string; sceneStr: string; qrUrl: string; expiresAt: string }
  | { ok: false; error: string; status: number; message?: string }
> {
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) return { ok: false, error: 'wx_oa_not_configured', status: 503 }

  const memberId = String(talentMemberId || '').trim()
  if (!memberId) return { ok: false, error: 'invalid_talent_member_id', status: 400 }
  if (!findMember(data, memberId)) return { ok: false, error: 'member_not_found', status: 404 }

  const ticket = newTicketId()
  const sceneStr = ticket.length <= SCENE_MAX ? ticket : ticket.slice(0, SCENE_MAX)
  const now = nowCn()
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toLocaleString('zh-CN', { hour12: false })

  const list = pruneTickets(data)
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.talentMemberId === memberId && list[i]?.status === 'pending') {
      list.splice(i, 1)
    }
  }
  list.push({
    ticket: sceneStr,
    talentMemberId: memberId,
    createdAt: now,
    expiresAt,
    status: 'pending',
  })
  data.mpWechatOaBindTickets = list

  const token = await getWechatOfficialAccountAccessToken()
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expire_seconds: Math.floor(TICKET_TTL_MS / 1000),
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: sceneStr } },
      }),
    },
  )
  const body = (await res.json()) as { ticket?: string; errcode?: number; errmsg?: string }
  if (!body.ticket) {
    const norm = normalizeWechatOaApiError(body.errmsg || `wx_oa_qrcode_${body.errcode ?? 'fail'}`)
    return {
      ok: false,
      error: norm.code,
      message: norm.message,
      status: norm.code === 'wx_oa_ip_not_whitelisted' ? 503 : 502,
    }
  }
  const qrUrl = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(body.ticket)}`
  return { ok: true, ticket: sceneStr, sceneStr, qrUrl, expiresAt }
}

function upsertBinding(
  data: RegistrySnapshot,
  talentMemberId: string,
  oaOpenId: string,
  mpOpenId?: string,
): void {
  const now = nowCn()
  const bindings = Array.isArray(data.mpWechatOaBindings) ? [...data.mpWechatOaBindings] : []
  for (const b of bindings) {
    if (!b) continue
    if (String(b.oaOpenId) === oaOpenId && b.active !== false) {
      b.active = false
      b.unboundAt = now
    }
  }
  const idx = bindings.findIndex((b) => b && String(b.talentMemberId) === talentMemberId)
  const row = {
    talentMemberId,
    oaOpenId,
    mpOpenId: String(mpOpenId || '').trim() || undefined,
    boundAt: now,
    active: true,
  }
  if (idx >= 0) bindings[idx] = { ...bindings[idx]!, ...row }
  else bindings.push(row)
  data.mpWechatOaBindings = bindings

  const members = [...(data.mpTalentMembers ?? [])]
  const mIdx = members.findIndex((m) => m && String(m.id) === talentMemberId)
  if (mIdx >= 0) {
    members[mIdx] = { ...members[mIdx]!, wxOaOpenId: oaOpenId, wxOaBoundAt: now }
    data.mpTalentMembers = members
  }
}

export function completeWechatOaBindInSnapshot(
  data: RegistrySnapshot,
  ticket: string,
  oaOpenId: string,
): { ok: true; talentMemberId: string } | { ok: false; error: string } {
  const tid = String(ticket || '').trim()
  const oid = String(oaOpenId || '').trim()
  if (!tid || !oid) return { ok: false, error: 'invalid_bind_args' }

  const list = pruneTickets(data)
  const idx = list.findIndex((t) => t && t.ticket === tid)
  if (idx < 0) return { ok: false, error: 'ticket_not_found' }
  const row = list[idx]!
  if (row.status !== 'pending') return { ok: false, error: 'ticket_not_pending' }

  const member = findMember(data, row.talentMemberId)
  const mpOpenId = String(member?.wxOpenId || '').trim()

  row.status = 'bound'
  row.oaOpenId = oid
  row.boundAt = nowCn()
  data.mpWechatOaBindTickets = list

  upsertBinding(data, row.talentMemberId, oid, mpOpenId)
  return { ok: true, talentMemberId: row.talentMemberId }
}

export function markWechatOaBindTicketBound(
  data: RegistrySnapshot,
  ticket: string,
): boolean {
  const tid = String(ticket || '').trim()
  if (!tid) return false
  const list = pruneTickets(data)
  const idx = list.findIndex((t) => t && t.ticket === tid && t.status === 'pending')
  if (idx < 0) return false
  list[idx] = { ...list[idx]!, status: 'bound', boundAt: nowCn() }
  data.mpWechatOaBindTickets = list
  return true
}
