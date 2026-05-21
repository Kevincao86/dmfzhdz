import type { SupabaseClient } from '@supabase/supabase-js'
import type { IceBatchJob } from '../services/aliyunIceCloudApi'
import { iceJobDownloadProxyPath } from '../services/aliyunIceCloudApi'
import { buildErpRegistryTenant } from './buildErpRegistryTenant'
import { appendRecruitmentOrderToOps } from './opsRegistryClient'
import type { RegistryIceVideoSlot, RegistryRecruitmentOrder } from './opsRegistryTypes'
import { resolveRecruitmentOrderTenantMeta } from './recruitmentOrderMeta'

function buildIceSlots(doneJobs: IceBatchJob[]): RegistryIceVideoSlot[] {
  return doneJobs.map((j, i) => {
    const jobId = j.exportId?.trim() || j.id
    const downloadUrl = j.exportId
      ? iceJobDownloadProxyPath(j.exportId)
      : (j.downloadUrl?.trim() || j.mediaUrl)
    return {
      slotId: `slot-${i + 1}`,
      label: j.label || `成片 ${i + 1}`,
      downloadUrl,
      iceJobId: jobId,
    }
  })
}

export async function dispatchIceBatchToRecruitmentOps(opts: {
  doneJobs: IceBatchJob[]
  editBrief: string
  supabase: SupabaseClient | null
}): Promise<{ orderId: string }> {
  const { doneJobs, editBrief, supabase } = opts
  if (doneJobs.length === 0) {
    throw new Error('暂无可用成片，请先完成批量云剪')
  }

  const tenant = buildErpRegistryTenant()
  const customerName = tenant?.merchantName ?? '墨典 ERP 商户'
  const storeName = '云剪批量成片'
  const n = doneJobs.length
  const brief = editBrief.trim().slice(0, 500)
  const id = `RO-ICE${Date.now()}`
  const tenantMeta = await resolveRecruitmentOrderTenantMeta(supabase)
  const slots = buildIceSlots(doneJobs)

  const order: RegistryRecruitmentOrder = {
    id,
    ...tenantMeta,
    customerName,
    storeName,
    talentId: '—',
    talentName: '云剪·待运营下发云剪单',
    fans: n,
    accountType: '抖音',
    recruitmentPlatform: '抖音',
    coopTimes: 0,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'pending',
    serviceAmount: 0,
    commissionPct: 0,
    netAmount: 0,
    storeAddress: storeName,
    category: '云剪投放',
    orderKind: 'recruitment_ice',
    iceVideoCount: n,
    iceVideoSlots: slots,
    infoSummary: `【云剪·招募投放】订单类型:云剪（招募、云剪）；云剪视频数量:${n}；剪辑指令:${brief || '—'}；说明:达人认领后下载分配成片，发布抖音并回传作品链接，AI 自动核查；全部通过后进入待结算。`,
  }

  await appendRecruitmentOrderToOps(order)
  return { orderId: id }
}
