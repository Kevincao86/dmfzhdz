#!/usr/bin/env npx tsx
import { findRegistryMemberForAccount } from '../src/lib/mpRegistryProfileGet.ts'
import { enrichMemberFromRegistrySources } from '../src/lib/mpRegistryProfileEnrich.ts'
import { registryMemberToClientDraft } from '../src/lib/registryMemberClientMap.ts'
import type { MpAccountRow } from '../src/lib/mpAccountAuth.ts'

const data = {
  talentLibraryEntries: [
    {
      id: 'TL-1',
      lingqiTalentId: 'LQ-D-000001',
      platform: '抖音' as const,
      platformAccount: 'vcdd',
      platformNickname: '迷糊',
      profileLink: 'https://v.douyin.com/x',
      followers: 5000,
      contact: '18768501283',
      wechatId: '18768501283',
      quotePrice: '500',
      paymentMethod: '支付宝',
      updatedAt: '2026/6/7',
    },
    // 共用 LQ-D-000012：达人库是 A 手机，会员表是 B 手机
    {
      id: 'TL-12-A',
      lingqiTalentId: 'LQ-D-000012',
      platform: '抖音' as const,
      platformAccount: '85403247047',
      platformNickname: '肖肖公主',
      followers: 1000,
      contact: '15757468650',
      wechatId: '15757468650',
      province: '浙江省',
      city: '宁波市',
      gender: '男',
      quotePrice: '50',
      douyinSalesLevel: 'LV3',
      alipayAccount: '15757468650',
      paymentMethod: '支付宝',
      updatedAt: '2026/7/13',
    },
    {
      id: 'TL-12-B',
      lingqiTalentId: 'LQ-D-000012',
      platform: '抖音' as const,
      platformAccount: 'xiejinchao9527',
      platformNickname: '极道视界',
      followers: 700,
      contact: '13806831505',
      wechatId: '13806831505',
      province: '浙江省',
      city: '温州市',
      gender: '男',
      quotePrice: '1000',
      paymentMethod: '支付宝',
      updatedAt: '2026/7/18',
    },
  ],
  mpTalentMembers: [
    {
      id: 'MTM-A',
      lingqiTalentId: 'LQ-D-000001',
      contact: '18768501283',
      wechatId: '18768501283',
      wxNickName: '迷糊',
      wxAvatarUrl: '',
      memberType: 'douyin' as const,
      platformProfiles: {
        douyin: {
          enabled: true,
          platformAccount: 'vcdd',
          platformNickname: '迷糊',
          profileLink: 'https://v.douyin.com/x',
          followers: 5000,
        },
      },
      registeredAt: '2026/6/1',
      updatedAt: '2026/6/7',
    },
    {
      id: 'MTM-B',
      lingqiTalentId: 'LQ-D-000009',
      contact: '18768501283',
      wechatId: '18768501283',
      wxNickName: 'jd',
      wxAvatarUrl: '',
      memberType: 'douyin' as const,
      registeredAt: '2026/6/4',
      updatedAt: '2026/6/4',
    },
    {
      id: 'MTM-12',
      lingqiTalentId: 'LQ-D-000012',
      contact: '13806831505',
      wechatId: '13806831505',
      wxNickName: '极道视界',
      wxAvatarUrl: '',
      memberType: 'douyin' as const,
      province: '浙江省',
      city: '温州市',
      platformProfiles: {
        douyin: {
          enabled: true,
          platformAccount: 'xiejinchao9527',
          platformNickname: '极道视界',
          followers: 700,
          quotePrice: '1000',
        },
      },
      registeredAt: '2026/6/15',
      updatedAt: '2026/7/18',
    },
  ],
}

const account = {
  id: 'acc-1',
  registry_member_id: 'MTM-B',
  lingqi_talent_id: 'LQ-D-000009',
  login_name: '18768501283',
} as MpAccountRow

const hit = findRegistryMemberForAccount(data, account)
if (!hit || hit.lingqiTalentId !== 'LQ-D-000009') {
  console.error('FAIL: expected LQ-D-000009 member', hit?.lingqiTalentId)
  process.exit(1)
}

const byTalentOnly = findRegistryMemberForAccount(data, {
  ...account,
  registry_member_id: null,
} as MpAccountRow)
if (!byTalentOnly || byTalentOnly.lingqiTalentId !== 'LQ-D-000009') {
  console.error('FAIL: talent id lookup', byTalentOnly?.lingqiTalentId)
  process.exit(1)
}

const enriched = enrichMemberFromRegistrySources(data, account, hit!)
const draft = registryMemberToClientDraft(enriched!)
const douyin = (draft.platformProfiles as Record<string, Record<string, unknown>>)?.douyin
if (!douyin || douyin.platformNickname !== '迷糊' || douyin.platformAccount !== 'vcdd') {
  console.error('FAIL: expected merged douyin profile from library/sibling', douyin)
  process.exit(1)
}
if (draft.lingqiTalentId !== 'LQ-D-000009') {
  console.error('FAIL: draft must keep account lingqi id', draft.lingqiTalentId)
  process.exit(1)
}

const libOnly = enrichMemberFromRegistrySources(data, account, null)
if (!libOnly || !libOnly.platformProfiles?.douyin) {
  console.error('FAIL: library-only enrich')
  process.exit(1)
}

// —— 共用 LQ-D：登录 157… 不应拿到 138… 的会员，应从达人库回填肖肖公主 ——
const conflictAccount = {
  id: 'acc-157',
  registry_member_id: 'MTM-12',
  lingqi_talent_id: 'LQ-D-000012',
  login_name: '15757468650',
} as MpAccountRow

const conflictHit = findRegistryMemberForAccount(data, conflictAccount)
if (conflictHit) {
  console.error('FAIL: must not bind MTM with different phone via shared LQ-D', conflictHit.contact)
  process.exit(1)
}

const conflictEnriched = enrichMemberFromRegistrySources(data, conflictAccount, conflictHit)
const conflictDraft = registryMemberToClientDraft(conflictEnriched!)
const conflictDy = (conflictDraft.platformProfiles as Record<string, Record<string, unknown>>)?.douyin
if (
  !conflictDy ||
  conflictDy.platformNickname !== '肖肖公主' ||
  conflictDy.platformAccount !== '85403247047'
) {
  console.error('FAIL: expected library profile for 15757468650', conflictDy)
  process.exit(1)
}
if (String(conflictDraft.contact || '') !== '15757468650') {
  console.error('FAIL: contact must be login phone', conflictDraft.contact)
  process.exit(1)
}
if (String(conflictDraft.province || '') !== '浙江省' || String(conflictDraft.city || '') !== '宁波市') {
  console.error('FAIL: province/city from library', conflictDraft.province, conflictDraft.city)
  process.exit(1)
}
if (String(conflictDraft.gender || '') !== '男') {
  console.error('FAIL: gender from library', conflictDraft.gender)
  process.exit(1)
}
if (String(conflictDraft.id || '') === 'MTM-12') {
  console.error('FAIL: must not stamp wrong MTM id from other phone', conflictDraft.id)
  process.exit(1)
}

console.log('OK: registry member lookup + talent library merge + shared LQ-D phone guard')
