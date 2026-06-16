#!/usr/bin/env node
/** 注册表持久化压缩：剥离内联 base64，群码迁入 mpGroupQrByOrderId */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const { compactRegistryForPersist } = require(
  path.join(root, 'src/lib/mpRecruitmentRegistryPersist.ts'),
)

const big = 'data:image/jpeg;base64,' + 'A'.repeat(9000)
const data = {
  mpRecruitmentOrders: [
    {
      id: 'MP-TEST-1',
      sourceMerchantOrderId: 'USER-1',
      groupQrImage: big,
      coverImage: big,
      mpPublishMeta: { groupQrImage: big, prWxAvatarUrl: big },
    },
  ],
  mpTalentMembers: [{ id: 'M1', wxAvatarUrl: big }],
  mpPrUsers: [{ id: 'P1', wxAvatarUrl: big }],
  mpTalentInbox: [{ id: 'in1', mpOrderId: 'MP-TEST-1', imageUrl: big }],
}

const before = JSON.stringify(data).length
const out = compactRegistryForPersist(data)
const after = JSON.stringify(out).length
if (out.mpRecruitmentOrders[0].groupQrImage) throw new Error('order groupQrImage not stripped')
if (out.mpTalentMembers[0].wxAvatarUrl) throw new Error('member avatar not stripped')
if (!out.mpGroupQrByOrderId?.['MP-TEST-1']) throw new Error('group qr not in side map')
if (after >= before) throw new Error(`compact did not shrink: ${before} -> ${after}`)
console.log(`[mp-registry-compact-smoke] OK ${before} -> ${after} bytes`)
