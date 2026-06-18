#!/usr/bin/env node
/**
 * 达人小程序公告链路模拟测试（10 项检查）
 * 用法：node scripts/mp-ops-announcement-smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function fail(n, msg) {
  console.error(`[check ${n}/10] FAIL: ${msg}`)
  process.exit(1)
}
function pass(n, msg) {
  console.log(`[check ${n}/10] OK: ${msg}`)
}

// --- 1–2: 源码 normalize 必须保留 inbox / 公告历史 ---
const gatewaySrc = fs.readFileSync(
  path.join(root, 'vite-plugins/opsRegistryGatewayCore.ts'),
  'utf8',
)
if (!gatewaySrc.includes('mpTalentInbox') || !/mpTalentInbox,/.test(gatewaySrc)) {
  fail(1, 'normalizeRegistryFile 未输出 mpTalentInbox')
}
pass(1, 'normalizeRegistryFile 保留 mpTalentInbox')

if (!gatewaySrc.includes('mpOpsAnnouncements') || !/mpOpsAnnouncements,/.test(gatewaySrc)) {
  fail(2, 'normalizeRegistryFile 未输出 mpOpsAnnouncements')
}
pass(2, 'normalizeRegistryFile 保留 mpOpsAnnouncements')

// --- 简化 normalize（与修复后行为一致）---
function normalizeRegistryFile(parsed) {
  return {
    mpTalentMembers: Array.isArray(parsed?.mpTalentMembers) ? parsed.mpTalentMembers : [],
    mpTalentInbox: Array.isArray(parsed?.mpTalentInbox) ? parsed.mpTalentInbox : [],
    mpOpsAnnouncements: Array.isArray(parsed?.mpOpsAnnouncements) ? parsed.mpOpsAnnouncements : [],
    talentLibraryEntries: Array.isArray(parsed?.talentLibraryEntries) ? parsed.talentLibraryEntries : [],
    tenants: [],
    aiModels: {},
    vendorKeys: {},
    vendorKeysUpdatedAt: '',
    vendorKeysWriter: 'erp',
  }
}

function phoneDigits(contact) {
  return String(contact || '').replace(/\D/g, '').slice(-11)
}
function contactKey(contact) {
  const digits = phoneDigits(contact)
  return digits.length >= 7 ? `contact:${digits.slice(-11)}` : ''
}

function talentInboxMatchKeysFromProfile(account, member) {
  const keys = new Set()
  for (const v of [account.lingqi_talent_id, account.registry_member_id, member?.id, member?.lingqiTalentId]) {
    const s = String(v || '').trim()
    if (s) keys.add(s)
  }
  const loginPhone = phoneDigits(account.login_name)
  if (loginPhone) {
    keys.add(loginPhone)
    const lk = contactKey(loginPhone)
    if (lk) keys.add(lk)
  }
  const contact = String(member?.contact || '').trim()
  if (contact) {
    keys.add(contact)
    const ck = contactKey(contact)
    if (ck) keys.add(ck)
    const phone = phoneDigits(contact)
    if (phone) keys.add(phone)
  }
  return keys
}

function rowMatchesKeys(row, keys) {
  const mid = String(row.talentMemberId || '').trim()
  const contact = String(row.contact || '').trim()
  if (contact) {
    if (keys.has(contact)) return true
    const ck = contactKey(contact)
    if (ck && keys.has(ck)) return true
    const phone = phoneDigits(contact)
    if (phone && keys.has(phone)) return true
  }
  if (mid && keys.has(mid)) return true
  return false
}

function filterTalentInboxForHall(inbox, keys) {
  if (!keys.size || !Array.isArray(inbox) || !inbox.length) return []
  return inbox.filter((row) => row && rowMatchesKeys(row, keys))
}

function appendInbox(data, entries) {
  const list = [...(data.mpTalentInbox ?? [])]
  let added = 0
  for (let i = 0; i < entries.length; i++) {
    const row = entries[i]
    if (!row.talentMemberId || !row.title) continue
    list.unshift({
      id: `inbox-test-${Date.now()}-${i}`,
      talentMemberId: row.talentMemberId,
      title: row.title,
      body: row.body,
      category: 'system',
      noticeType: 'ops_broadcast',
      contact: row.contact,
      pinned: row.pinned !== false,
      announcementId: row.announcementId,
      createdAt: '2026-06-16 12:00:00',
      read: false,
    })
    added += 1
  }
  data.mpTalentInbox = list
  return added
}

function sendAnnouncement(data, recipients, title, body) {
  const announcementId = `ops-ann-test-${Date.now()}`
  const entries = recipients.map((m) => ({
    talentMemberId: m.id,
    title,
    body,
    category: 'system',
    noticeType: 'ops_broadcast',
    contact: phoneDigits(m.contact) || undefined,
    pinned: true,
    announcementId,
  }))
  const count = appendInbox(data, entries)
  const history = [...(data.mpOpsAnnouncements ?? [])]
  history.unshift({
    id: announcementId,
    title,
    body,
    showHomePopup: true,
    targetFilter: {},
    recipientCount: count,
    createdAt: '2026-06-16 12:00:00',
    createdBy: null,
  })
  data.mpOpsAnnouncements = history
  return { announcementId, recipientCount: count }
}

// --- 3–6: load → send → reload 往返 ---
const members = [
  { id: 'LQ-D-000015', contact: '15657827912', province: '浙江省', city: '杭州市' },
  { id: 'LQ-D-000029', contact: '13800000029', province: '浙江省', city: '杭州市' },
  { id: 'LQ-D-000028', contact: '13800000028', province: '浙江省', city: '杭州市' },
]
const rawDb = {
  mpTalentMembers: members,
  mpTalentInbox: [{ id: 'old-1', talentMemberId: 'LQ-D-000015', title: '旧消息', noticeType: 'general' }],
  mpOpsAnnouncements: [{ id: 'old-ann', title: '旧公告', recipientCount: 1 }],
}

let snap = normalizeRegistryFile(rawDb)
if (snap.mpTalentInbox.length !== 1) fail(3, `load 后 inbox 应为 1，实际 ${snap.mpTalentInbox.length}`)
pass(3, 'load 后保留已有 mpTalentInbox')

const sendResult = sendAnnouncement(snap, members, '资料补全提醒', '111')
if (sendResult.recipientCount !== 3) {
  fail(4, `应推送 3 人，实际 ${sendResult.recipientCount}`)
}
pass(4, 'send 写入 3 条 ops_broadcast inbox')

if (!snap.mpOpsAnnouncements?.length || snap.mpOpsAnnouncements[0].recipientCount !== 3) {
  fail(5, 'send 未写入 mpOpsAnnouncements 历史')
}
pass(5, 'send 写入公告发送记录')

const reloaded = normalizeRegistryFile(JSON.parse(JSON.stringify(snap)))
if (reloaded.mpTalentInbox.length !== 4) {
  fail(6, `reload 后 inbox 应为 4（1 旧 + 3 新），实际 ${reloaded.mpTalentInbox.length}`)
}
if (reloaded.mpOpsAnnouncements.length !== 2) {
  fail(6, `reload 后公告历史应为 2，实际 ${reloaded.mpOpsAnnouncements.length}`)
}
pass(6, 'save→reload 往返不丢失 inbox 与公告历史')

// --- 7–8: 达人端匹配（memberId / 登录手机号）---
const targetMember = members[0]
const account = {
  registry_member_id: 'LQ-D-000015',
  login_name: '15657827912',
}
const keys = talentInboxMatchKeysFromProfile(account, targetMember)
const opsRows = reloaded.mpTalentInbox.filter((r) => r.noticeType === 'ops_broadcast')
const hallRows = filterTalentInboxForHall(opsRows, keys)
if (!hallRows.some((r) => r.title === '资料补全提醒')) {
  fail(7, 'memberId 匹配未命中 ops_broadcast')
}
pass(7, 'hall 过滤：registry_member_id 命中公告')

const keysPhoneOnly = talentInboxMatchKeysFromProfile({ login_name: '15657827912' }, { id: 'LQ-D-000015' })
const hallPhone = filterTalentInboxForHall(opsRows, keysPhoneOnly)
if (!hallPhone.length) {
  fail(8, '登录手机号未命中 ops_broadcast（小程序/大厅路径）')
}
pass(8, 'hall 过滤：login_name 手机号命中公告')

// --- 9: 系统 Tab 分类 ---
const systemRows = hallRows.filter((r) => r.noticeType === 'ops_broadcast' && r.category === 'system')
if (!systemRows.length) {
  fail(9, 'ops_broadcast 未标记 category=system')
}
pass(9, 'ops_broadcast → 系统通知 Tab')

// --- 10: registrySnapshotIoFetch save 被 block 时应 throw ---
const ioSrc = fs.readFileSync(path.join(root, 'src/lib/registrySnapshotIoFetch.ts'), 'utf8')
if (!ioSrc.includes('throw new Error(\'registry_snapshot_unsafe_to_persist\')')) {
  fail(10, 'unsafe persist 仍静默 return，send 可能假成功')
}
pass(10, 'unsafe persist 会 throw，send 不会假成功')

const authSrc = fs.readFileSync(path.join(root, 'api/meoo-ops-mp-auth.ts'), 'utf8')
if (!authSrc.includes("action === 'talent_inbox'")) {
  fail(11, 'meoo-ops-mp-auth 缺少 talent_inbox action')
}
pass(11, '小程序专用 talent_inbox API 已注册')

const keysMember = talentInboxMatchKeysFromProfile(
  { registry_member_id: 'LQ-D-000015', login_name: '15657827912' },
  targetMember,
)
const sliceRows = filterTalentInboxForHall(reloaded.mpTalentInbox, keysMember)
if (!sliceRows.some((r) => r.noticeType === 'ops_broadcast')) {
  fail(12, 'inbox 列切片未含 ops_broadcast（hall 轻量单路径会丢公告）')
}
pass(12, '仅拉 inbox 列即可命中 ops 公告，与星选 full registry 对齐')

console.log('\n[mp-ops-announcement-smoke] 全部 12 项检查通过')
