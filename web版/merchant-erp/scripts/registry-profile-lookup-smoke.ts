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

console.log('OK: registry member lookup + talent library merge for LQ-D-000009')
