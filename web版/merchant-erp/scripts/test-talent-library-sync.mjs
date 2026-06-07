/**
 * 本地自检：履约 Web platformProfiles 保存后应同步 talentLibraryEntries
 * node scripts/test-talent-library-sync.mjs
 */
import { upsertMpTalentMember } from '../src/lib/mpTalentMemberUpsert.ts'

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
