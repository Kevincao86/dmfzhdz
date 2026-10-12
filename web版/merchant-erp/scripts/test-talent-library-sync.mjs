/**
 * 本地自检：履约 Web platformProfiles 保存后应同步 talentLibraryEntries
 * node scripts/test-talent-library-sync.mjs
 */
import { upsertMpTalentMember } from '../src/lib/mpTalentMemberUpsert.ts'
import { upsertTalentLibraryFromApplicant } from '../src/lib/talentLibraryUpsert.ts'

const data = {
  mpTalentMembers: [],
  talentLibraryEntries: [
    {
      id: 'TL-old',
      platform: '抖音',
      platformAccount: 'vcdd',
      platformNickname: 'kk',
      profileLink: 'old-link',
      followers: 5000,
      douyinSalesLevel: 'Lv4',
      contact: '15757468650',
      wechatId: '15757468650',
      quotePrice: '150',
      paymentMethod: '支付宝',
      updatedAt: '2026/6/3 10:00:00',
    },
  ],
}

const saved = upsertMpTalentMember(data, {
  id: 'MTM-test',
  memberType: 'douyin',
  wxNickName: 'jd',
  wxAvatarUrl: '',
  contact: '15757468650',
  wechatId: '15757468650',
  province: '北京市',
  city: '北京市',
  registeredAt: '2026/6/6 23:00:00',
  updatedAt: '2026/6/6 23:17:00',
  platformProfiles: {
    douyin: {
      enabled: true,
      platformAccount: 'vcdd',
      platformNickname: '慢慢去看海',
      profileLink: 'https://v.douyin.com/nk49vT-LArs/',
      followers: '5000',
      douyinSalesLevel: 'Lv4',
      quotePrice: '150',
      alipayAccount: '',
    },
  },
})

const entry = data.talentLibraryEntries.find((e) => e.platformAccount === 'vcdd')
if (!entry) {
  console.error('FAIL: talent library entry missing')
  process.exit(1)
}
if (entry.platformNickname !== '慢慢去看海') {
  console.error('FAIL: nickname not updated', entry.platformNickname)
  process.exit(1)
}
if (!String(entry.profileLink).includes('douyin.com')) {
  console.error('FAIL: profileLink not updated', entry.profileLink)
  process.exit(1)
}
if (!saved.lingqiTalentId?.startsWith('LQ-D-')) {
  console.error('FAIL: lingqiTalentId not allocated', saved.lingqiTalentId)
  process.exit(1)
}
if (entry.lingqiTalentId !== saved.lingqiTalentId) {
  console.error('FAIL: library lingqiTalentId mismatch', entry.lingqiTalentId, saved.lingqiTalentId)
  process.exit(1)
}
console.log('OK talent-library-sync', {
  lingqiTalentId: saved.lingqiTalentId,
  nickname: entry.platformNickname,
  profileLink: entry.profileLink,
})

const bare = {
  mpTalentMembers: [],
  talentLibraryEntries: [],
}
const bareSaved = upsertMpTalentMember(bare, {
  id: 'MTM-bare',
  memberType: 'douyin',
  wxNickName: '只注册',
  wxAvatarUrl: '',
  contact: '13800001111',
  wechatId: '13800001111',
  workIdentity: 'talent',
  registeredAt: '2026/10/12 10:00:00',
  updatedAt: '2026/10/12 10:00:00',
})
const placeholder = bare.talentLibraryEntries.find((e) => (e.accountTags || []).includes('资料未完善'))
if (!placeholder) {
  console.error('FAIL: registered member without platform account was not written to library')
  process.exit(1)
}
if (placeholder.platformAccount !== '13800001111') {
  console.error('FAIL: placeholder account', placeholder.platformAccount)
  process.exit(1)
}
if (!bareSaved.lingqiTalentId?.startsWith('LQ-D-')) {
  console.error('FAIL: bare member lingqi id', bareSaved.lingqiTalentId)
  process.exit(1)
}

const filled = upsertMpTalentMember(bare, {
  ...bareSaved,
  platformProfiles: {
    douyin: {
      enabled: true,
      platformAccount: 'real_dy',
      platformNickname: '只注册',
      profileLink: '',
      followers: 100,
      quotePrice: '',
    },
  },
})
if (bare.talentLibraryEntries.some((e) => (e.accountTags || []).includes('资料未完善'))) {
  console.error('FAIL: incomplete placeholder remained after real profile')
  process.exit(1)
}
const real = bare.talentLibraryEntries.find((e) => e.platformAccount === 'real_dy')
if (!real || real.lingqiTalentId !== filled.lingqiTalentId) {
  console.error('FAIL: real profile not synced', real)
  process.exit(1)
}
console.log('OK talent-library-placeholder', {
  lingqiTalentId: filled.lingqiTalentId,
  realAccount: real.platformAccount,
})

const idData = {
  mpTalentMembers: [
    {
      id: 'MTM-has',
      lingqiTalentId: 'LQ-D-000088',
      contact: '13900001111',
      wechatId: '13900001111',
      wxNickName: '已有编号',
      registeredAt: '2026/10/1',
      updatedAt: '2026/10/1',
    },
    {
      id: 'MTM-none',
      contact: '13900002222',
      wechatId: '13900002222',
      wxNickName: '待发编号',
      registeredAt: '2026/10/1',
      updatedAt: '2026/10/1',
    },
  ],
  talentLibraryEntries: [],
}
upsertTalentLibraryFromApplicant(idData, {
  platform: '抖音',
  mpOrderId: 'MO-1',
  merchantOrderNo: '',
  applicant: {
    id: 'a1',
    name: '已有编号',
    platformAccount: 'has_dy',
    platformNickname: '已有编号',
    contact: '13900001111',
    followers: 10,
  },
})
upsertTalentLibraryFromApplicant(idData, {
  platform: '抖音',
  mpOrderId: 'MO-2',
  merchantOrderNo: '',
  applicant: {
    id: 'a2',
    name: '待发编号',
    platformAccount: 'need_dy',
    platformNickname: '待发编号',
    contact: '13900002222',
    followers: 20,
  },
})
upsertTalentLibraryFromApplicant(idData, {
  platform: '抖音',
  mpOrderId: 'MO-3',
  merchantOrderNo: '',
  applicant: {
    id: 'a3',
    name: '待发编号',
    platformAccount: 'need_dy_2',
    platformNickname: '待发编号2',
    contact: '13900002222',
    followers: 21,
  },
})
const reused = idData.talentLibraryEntries.find((e) => e.platformAccount === 'has_dy')
const issued = idData.talentLibraryEntries.find((e) => e.platformAccount === 'need_dy')
const sibling = idData.talentLibraryEntries.find((e) => e.platformAccount === 'need_dy_2')
if (reused?.lingqiTalentId !== 'LQ-D-000088') {
  console.error('FAIL: did not reuse member lingqi id', reused)
  process.exit(1)
}
if (!issued?.lingqiTalentId?.startsWith('LQ-D-')) {
  console.error('FAIL: did not issue lingqi id', issued)
  process.exit(1)
}
if (sibling?.lingqiTalentId !== issued.lingqiTalentId) {
  console.error('FAIL: same phone got two lingqi ids', issued?.lingqiTalentId, sibling?.lingqiTalentId)
  process.exit(1)
}
if (idData.mpTalentMembers.find((m) => m.id === 'MTM-none')?.lingqiTalentId !== issued.lingqiTalentId) {
  console.error('FAIL: member was not given the new lingqi id')
  process.exit(1)
}
console.log('OK talent-library-lingqi-id', {
  reused: reused.lingqiTalentId,
  issued: issued.lingqiTalentId,
})
