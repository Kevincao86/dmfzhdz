#!/usr/bin/env node
/**
 * 从 mp_account_client_state / mpTalentInbox / 达人库 / 会员资料 重建指定招募单的 applicants。
 * 轻量 ECS:
 *   ORDER_ID=MP-RO-xxx DRY_RUN=1 node scripts/ecs-recover-mp-order-applicants.mjs
 *   ORDER_ID=MP-RO-xxx node scripts/ecs-recover-mp-order-applicants.mjs
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const ORDER_ID = String(process.env.ORDER_ID || '').trim()
const DRY_RUN = String(process.env.DRY_RUN || '').trim() === '1'
if (!ORDER_ID) {
  console.error('用法: ORDER_ID=MP-RO-xxx [DRY_RUN=1] node scripts/ecs-recover-mp-order-applicants.mjs')
  process.exit(1)
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      const k = m[1]
      if (process.env[k]) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[k] = v
    }
  } catch {
    /* optional */
  }
}

const root = resolve(process.cwd())
const home = homedir()
for (const p of [
  resolve(home, 'stack/auth-api.env'),
  resolve(home, 'stack/.env'),
  resolve(root, 'web版/merchant-erp/.env'),
  resolve(root, '.env'),
  '/etc/meoo/auth-api.env',
]) {
  loadEnvFile(p)
}

const supabaseUrl = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:8888',
).replace(/\/$/, '')
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!serviceRole) {
  console.error('缺少 SUPABASE_SERVICE_ROLE_KEY（轻量请先: source ~/stack/auth-api.env）')
  process.exit(1)
}

const headers = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  Accept: 'application/json',
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${url} ${res.status}: ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : null
}

function appliedAtFromApplicantId(id) {
  const m = String(id || '').match(/^app-(\d{10,})$/)
  if (!m) return ''
  const ms = Number(m[1])
  if (!Number.isFinite(ms) || ms < 1e11) return ''
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function pickPlatformProfile(member, platform) {
  if (!member || typeof member !== 'object') return null
  const plat = String(platform || '抖音').trim()
  const profiles = member.platformProfiles && typeof member.platformProfiles === 'object' ? member.platformProfiles : {}
  if (profiles[plat] && profiles[plat].enabled !== false) return profiles[plat]
  if (plat.includes('抖音') && member.douyin) return member.douyin
  if ((plat.includes('小红书') || plat.includes('红')) && member.xiaohongshu) return member.xiaohongshu
  for (const v of Object.values(profiles)) {
    if (v && typeof v === 'object' && v.enabled !== false) return v
  }
  return member.douyin || member.xiaohongshu || null
}

function buildApplicantFromMember(member, opts) {
  const profile = pickPlatformProfile(member, opts.platform)
  const account = String(profile?.platformAccount || profile?.account || '').trim()
  const nick =
    String(profile?.platformNickname || profile?.nickname || member.wxNickName || '').trim() ||
    account ||
    '达人'
  const alipay = String(member.alipayAccount || '').trim()
  return {
    id: opts.applicantId,
    name: nick,
    platform: opts.platform,
    platformAccount: account || undefined,
    platformNickname: nick,
    followers: Math.max(0, Number(profile?.followers || profile?.fans || 0) || 0),
    douyinSalesLevel: String(profile?.douyinSalesLevel || profile?.talentGrade || '').trim() || undefined,
    contact: String(member.contact || '').trim() || '—',
    wechatId: String(member.wechatId || '').trim() || undefined,
    alipayAccount: alipay || undefined,
    paymentMethod: alipay ? `支付宝：${alipay}` : '支付宝',
    profileLink: String(profile?.profileLink || '').trim() || undefined,
    mpOrderId: opts.mpOrderId,
    merchantOrderNo: opts.merchantOrderNo,
    wxOpenId: String(member.wxOpenId || opts.openid || '').trim() || undefined,
    appliedAt: opts.appliedAt || appliedAtFromApplicantId(opts.applicantId) || opts.fallbackAt,
    province: String(member.province || '').trim() || undefined,
    city: String(member.city || '').trim() || undefined,
    gender: String(member.gender || '').trim() || undefined,
    accountTags: Array.isArray(member.accountTags) ? member.accountTags : undefined,
    prSelected: opts.prSelected === true,
    recoveredAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    recoveredSource: opts.source || 'member',
  }
}

function buildApplicantFromLibrary(entry, opts) {
  const nick = String(entry.platformNickname || entry.platformAccount || '达人').trim()
  const alipay = String(entry.alipayAccount || '').trim()
  return {
    id: opts.applicantId,
    name: nick,
    platform: entry.platform || opts.platform,
    platformAccount: String(entry.platformAccount || '').trim() || undefined,
    platformNickname: nick,
    followers: Math.max(0, Number(entry.followers || 0) || 0),
    douyinSalesLevel: String(entry.douyinSalesLevel || '').trim() || undefined,
    contact: String(entry.contact || '').trim() || '—',
    wechatId: String(entry.wechatId || '').trim() || undefined,
    quotePrice: String(entry.quotePrice || '').trim() || undefined,
    alipayAccount: alipay || undefined,
    paymentMethod: alipay ? `支付宝：${alipay}` : String(entry.paymentMethod || '支付宝'),
    profileLink: String(entry.profileLink || '').trim() || undefined,
    mpOrderId: opts.mpOrderId,
    merchantOrderNo: opts.merchantOrderNo,
    appliedAt: opts.appliedAt || appliedAtFromApplicantId(opts.applicantId) || entry.updatedAt || opts.fallbackAt,
    province: String(entry.province || '').trim() || undefined,
    city: String(entry.city || '').trim() || undefined,
    gender: String(entry.gender || '').trim() || undefined,
    accountTags: Array.isArray(entry.accountTags) ? entry.accountTags : undefined,
    prSelected: opts.prSelected === true,
    recoveredAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    recoveredSource: 'talent_library',
  }
}

function memberIndex(members) {
  const byMemberId = new Map()
  const byTalentId = new Map()
  const byOpenId = new Map()
  for (const m of members) {
    if (!m || !m.id) continue
    byMemberId.set(String(m.id), m)
    const tid = String(m.lingqiTalentId || '').trim()
    if (tid) byTalentId.set(tid, m)
    const oid = String(m.wxOpenId || '').trim()
    if (oid) byOpenId.set(oid, m)
  }
  return { byMemberId, byTalentId, byOpenId }
}

function resolveMemberForAccount(account, idx) {
  const memberId = String(account.registry_member_id || '').trim()
  if (memberId && idx.byMemberId.has(memberId)) return idx.byMemberId.get(memberId)
  const talentId = String(account.lingqi_talent_id || '').trim()
  if (talentId && idx.byTalentId.has(talentId)) return idx.byTalentId.get(talentId)
  const openid = String(account.openid || '').trim()
  if (openid && idx.byOpenId.has(openid)) return idx.byOpenId.get(openid)
  return null
}

function indexApplicantsFromRegistry(registry) {
  const byId = new Map()
  for (const o of registry.mpRecruitmentOrders || []) {
    if (!o) continue
    for (const a of o.applicants || []) {
      if (a?.id) byId.set(String(a.id), a)
    }
  }
  return byId
}

function libraryByAccount(registry, platform) {
  const map = new Map()
  for (const e of registry.talentLibraryEntries || []) {
    if (!e) continue
    const acct = String(e.platformAccount || '').trim().toLowerCase()
    if (!acct) continue
    map.set(`${String(e.platform || platform).trim()}::${acct}`, e)
  }
  return map
}

const snapRows = await fetchJson(`${supabaseUrl}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry,updated_at`)
const registry = snapRows[0]?.registry
if (!registry || typeof registry !== 'object') {
  console.error('注册表为空')
  process.exit(1)
}

const list = Array.isArray(registry.mpRecruitmentOrders) ? registry.mpRecruitmentOrders : []
const idxOrder = list.findIndex((o) => o && String(o.id) === ORDER_ID)
if (idxOrder < 0) {
  console.error(`未找到订单 ${ORDER_ID}`)
  process.exit(1)
}
const mp = list[idxOrder]
const platform = String(mp.platform || '抖音').trim()
const merchantOrderNo = String(mp.sourceMerchantOrderId || '').trim()
const selectedSet = new Set((Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []).map(String))
const existing = Array.isArray(mp.applicants) ? mp.applicants : []
const existingById = new Map(existing.filter(Boolean).map((a) => [String(a.id), a]))
const globalById = indexApplicantsFromRegistry(registry)
const libByAcct = libraryByAccount(registry, platform)
const memberIdx = memberIndex(registry.mpTalentMembers || [])

const idHints = new Map()
for (const id of selectedSet) idHints.set(id, { source: 'selectedApplicantIds' })
for (const a of existing) {
  if (a?.id) idHints.set(String(a.id), { source: 'existing' })
}
for (const row of registry.mpTalentInbox || []) {
  if (!row || String(row.mpOrderId || '') !== ORDER_ID) continue
  const aid = String(row.applicantId || '').trim()
  if (aid) idHints.set(aid, { source: 'inbox', inbox: row })
}

const accounts = await fetchJson(
  `${supabaseUrl}/rest/v1/mp_accounts?select=id,openid,registry_member_id,lingqi_talent_id&order=updated_at.desc&limit=5000`,
)
const states = await fetchJson(
  `${supabaseUrl}/rest/v1/mp_account_client_state?select=account_id,payload&limit=5000`,
)
const accountById = new Map((accounts || []).map((a) => [String(a.id), a]))
for (const row of states || []) {
  const accountId = String(row.account_id || '').trim()
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  const apps = Array.isArray(payload.applications) ? payload.applications : []
  for (const app of apps) {
    if (String(app.mpOrderId || '').trim() !== ORDER_ID) continue
    const aid = String(app.applicantId || '').trim()
    if (!aid) continue
    idHints.set(aid, {
      source: 'client_state',
      accountId,
      appliedAt: String(app.appliedAt || '').trim(),
    })
  }
}

for (const e of registry.talentLibraryEntries || []) {
  if (!e || String(e.lastMpOrderId || '') !== ORDER_ID) continue
  const acct = String(e.platformAccount || '').trim()
  if (!acct) continue
  const guessId = `app-lib-${acct.slice(0, 12)}-${ORDER_ID.slice(-6)}`
  if (!idHints.has(guessId)) {
    idHints.set(guessId, { source: 'talent_library_last_order', library: e })
  }
}

const fallbackAt = String(mp.createdAt || new Date().toLocaleString('zh-CN', { hour12: false }))
const recovered = []
const unresolved = []

for (const [applicantId, hint] of idHints.entries()) {
  if (existingById.has(applicantId)) {
    recovered.push(existingById.get(applicantId))
    continue
  }
  if (globalById.has(applicantId)) {
    recovered.push(globalById.get(applicantId))
    continue
  }

  let built = null
  if (hint.accountId && accountById.has(hint.accountId)) {
    const account = accountById.get(hint.accountId)
    const member = resolveMemberForAccount(account, memberIdx)
    if (member) {
      built = buildApplicantFromMember(member, {
        applicantId,
        platform,
        mpOrderId: ORDER_ID,
        merchantOrderNo,
        appliedAt: hint.appliedAt || appliedAtFromApplicantId(applicantId),
        fallbackAt,
        openid: account.openid,
        prSelected: selectedSet.has(applicantId),
        source: 'client_state+member',
      })
    }
  }

  if (!built && hint.inbox) {
    const inbox = hint.inbox
    const memberId = String(inbox.talentMemberId || '').trim()
    let member = memberIdx.byTalentId.get(memberId) || memberIdx.byMemberId.get(memberId)
    if (!member && memberId.startsWith('LQ-D-')) {
      member = (registry.mpTalentMembers || []).find((m) => String(m.lingqiTalentId || '') === memberId) || null
    }
    if (member) {
      built = buildApplicantFromMember(member, {
        applicantId,
        platform,
        mpOrderId: ORDER_ID,
        merchantOrderNo,
        appliedAt: appliedAtFromApplicantId(applicantId),
        fallbackAt,
        prSelected: selectedSet.has(applicantId),
        source: 'inbox+member',
      })
    }
  }

  if (!built && hint.library) {
    built = buildApplicantFromLibrary(hint.library, {
      applicantId,
      platform,
      mpOrderId: ORDER_ID,
      merchantOrderNo,
      appliedAt: appliedAtFromApplicantId(applicantId),
      fallbackAt,
      prSelected: selectedSet.has(applicantId),
    })
  }

  if (!built) {
    const acctGuess = String(applicantId).replace(/^app-lib-/, '')
    for (const [key, entry] of libByAcct.entries()) {
      if (!key.includes('::')) continue
      if (String(entry.lastMpOrderId || '') !== ORDER_ID) continue
      built = buildApplicantFromLibrary(entry, {
        applicantId,
        platform,
        mpOrderId: ORDER_ID,
        merchantOrderNo,
        appliedAt: appliedAtFromApplicantId(applicantId),
        fallbackAt,
        prSelected: selectedSet.has(applicantId),
      })
      break
    }
    void acctGuess
  }

  if (built) recovered.push(built)
  else unresolved.push({ applicantId, hint })
}

const dedup = new Map()
for (const a of recovered) {
  if (!a?.id) continue
  dedup.set(String(a.id), a)
}
for (const id of selectedSet) {
  if (!dedup.has(id)) unresolved.push({ applicantId: id, hint: { source: 'selected_only' } })
}

const nextApplicants = [...dedup.values()].map((a) => ({
  ...a,
  prSelected: selectedSet.has(String(a.id)) || a.prSelected === true,
  mpOrderId: ORDER_ID,
  merchantOrderNo: merchantOrderNo || a.merchantOrderNo,
}))

nextApplicants.sort((a, b) => {
  const ta = Date.parse(String(a.appliedAt || '').replace(/\//g, '-')) || 0
  const tb = Date.parse(String(b.appliedAt || '').replace(/\//g, '-')) || 0
  return ta - tb
})

const report = {
  orderId: ORDER_ID,
  dryRun: DRY_RUN,
  before: {
    applicants: existing.length,
    applicantCount: mp.applicantCount,
    selectedApplicantIds: selectedSet.size,
  },
  after: {
    applicants: nextApplicants.length,
    selectedResolved: nextApplicants.filter((a) => selectedSet.has(String(a.id))).length,
  },
  idHints: idHints.size,
  unresolved: unresolved.slice(0, 30),
  sampleRecovered: nextApplicants.slice(0, 5).map((a) => ({
    id: a.id,
    name: a.platformNickname || a.name,
    platformAccount: a.platformAccount,
    prSelected: a.prSelected,
    source: a.recoveredSource,
  })),
}

console.log(JSON.stringify(report, null, 2))

if (nextApplicants.length <= existing.length && unresolved.length === 0 && existing.length > 0) {
  console.log('无需写入：已有报名且未发现可补全来源')
  process.exit(0)
}

if (DRY_RUN) {
  console.log('DRY_RUN=1，未写入数据库')
  process.exit(0)
}

mp.applicants = nextApplicants
mp.applicantCount = nextApplicants.length
mp.updatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
list[idxOrder] = mp
registry.mpRecruitmentOrders = list

const body = JSON.stringify({
  id: 1,
  registry,
  updated_at: new Date().toISOString(),
})
const saveRes = await fetch(`${supabaseUrl}/rest/v1/ops_registry_snapshot`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body,
})
const saveText = await saveRes.text()
if (!saveRes.ok) {
  console.error('保存失败:', saveText.slice(0, 300))
  process.exit(1)
}

console.log('OK: 已恢复并写入 ops_registry_snapshot')
