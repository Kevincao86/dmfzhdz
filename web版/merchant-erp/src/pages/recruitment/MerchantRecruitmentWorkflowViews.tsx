import {
  Check,
  ChevronLeft,
  Download,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  inferKolTierFromApplicant,
  kolTierLabel,
  type KolTierKey,
} from '../../lib/merchantRecruitmentTierPlan'
import { resolveTalentMemberIdForApplicant } from '../../lib/merchantRecruitmentInbox'
import {
  appendTalentInboxOnOps,
  fetchOpsRegistryForTenant,
  patchMpRecruitmentOrderOnOps,
  patchRecruitmentOrderOnOps,
} from '../../lib/opsRegistryClient'
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from '../../lib/opsRegistryTypes'
import RecruitmentCpsSyncPanel from '../../components/recruitment/RecruitmentCpsSyncPanel'
import RecruitmentXingxuanBridge from '../../components/recruitment/RecruitmentXingxuanBridge'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import { tenantLocalKey } from '../../lib/tenantLocalState'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'

async function loadWorkflowContext() {
  const tenantId = supabaseConfigured && supabase ? await fetchPrimaryTenantId(supabase) : null
  const reg = await fetchOpsRegistryForTenant(tenantId)
  let orderId = ''
  try {
    orderId = window.localStorage.getItem(tenantLocalKey('meoo_last_recruitment_order_id'))?.trim() ?? ''
  } catch {
    /* ignore */
  }
  const order = (reg.recruitmentOrders ?? []).find((o) => o.id === orderId) ?? null
  const mp =
    order?.linkedMpOrderId
      ? (reg.mpRecruitmentOrders ?? []).find((m) => m.id === order.linkedMpOrderId) ?? null
      : null
  return { reg, order, mp, orderId }
}

function tierQuota(plan: RegistryRecruitmentOrder['tierPlan'], tier: KolTierKey): number {
  if (!plan || plan.feeType === 'fixed') return plan?.totalHeadcount ?? 99
  return plan.tiers?.[tier]?.count ?? 0
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('read_failed'))
    r.readAsDataURL(file)
  })
}

function exportAlipayCsv(applicants: RegistryMpRecruitmentApplicant[], orderId: string) {
  const rows = [['达人昵称', '支付宝账号', '报价', '订单号']]
  for (const a of applicants) {
    if (!a.merchantSelected && !a.prSelected) continue
    rows.push([
      a.platformNickname || a.name,
      a.alipayAccount || '',
      a.quotePrice || '',
      orderId,
    ])
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `达人支付宝明细-${orderId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** 星选报名 → 商家按档位反选 + 群码通知 */
export function MerchantApplicantSelectView({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [mp, setMp] = useState<RegistryMpRecruitmentOrder | null>(null)
  const [reg, setReg] = useState<Awaited<ReturnType<typeof loadWorkflowContext>>['reg'] | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [groupQr, setGroupQr] = useState('')
  const [notifying, setNotifying] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ctx = await loadWorkflowContext()
      setReg(ctx.reg)
      setOrder(ctx.order)
      setMp(ctx.mp)
      const ids =
        ctx.mp?.selectedApplicantIds?.length
          ? ctx.mp.selectedApplicantIds.map(String)
          : (ctx.mp?.applicants ?? [])
              .filter((a) => a.merchantSelected || a.prSelected)
              .map((a) => String(a.id))
      setSelectedIds(ids)
      setGroupQr(String(ctx.mp?.groupQrImage || ''))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const applicants = mp?.applicants ?? []
  const plan = order?.tierPlan

  const byTier = useMemo(() => {
    const map: Record<KolTierKey, RegistryMpRecruitmentApplicant[]> = {
      v3: [],
      v4: [],
      v5: [],
      v5plus: [],
    }
    for (const a of applicants) {
      const t = inferKolTierFromApplicant(a)
      map[t].push(a)
    }
    return map
  }, [applicants])

  const toggle = (id: string, tier: KolTierKey) => {
    const set = new Set(selectedIds)
    if (set.has(id)) {
      set.delete(id)
    } else {
      const tierSelected = applicants.filter((a) => selectedIds.includes(String(a.id)) && inferKolTierFromApplicant(a) === tier)
      const cap = tierQuota(plan, tier)
      if (tierSelected.length >= cap) {
        window.alert(`${kolTierLabel(tier)} 档最多选 ${cap} 人，请先取消已选再添加。`)
        return
      }
      set.add(id)
    }
    setSelectedIds([...set])
  }

  const confirmSelection = async () => {
    if (!mp || !order) return
    if (!selectedIds.length) {
      window.alert('请至少选择一位达人')
      return
    }
    setBusy(true)
    try {
      const r = await patchMpRecruitmentOrderOnOps({
        id: mp.id,
        selectedApplicantIds: selectedIds,
        status: 'collecting',
      })
      if (!r.ok) throw new Error(r.error)
      await patchRecruitmentOrderOnOps({
        id: order.id,
        workflowStage: 'group_notify',
      })
      window.alert('反选已确认，请上传群二维码并通知达人。')
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const onUploadQr = async (file: File) => {
    if (!mp) return
    setBusy(true)
    try {
      const dataUrl = await readImageFile(file)
      if (dataUrl.length > 120_000) {
        window.alert('图片过大，请压缩后重试（建议 200KB 以内）')
        return
      }
      const r = await patchMpRecruitmentOrderOnOps({ id: mp.id, groupQrImage: dataUrl })
      if (!r.ok) throw new Error(r.error)
      setGroupQr(dataUrl)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  const notifySelected = async () => {
    if (!mp || !order || !reg) return
    if (!groupQr.trim()) {
      window.alert('请先上传群二维码')
      return
    }
    const selected = applicants.filter((a) => selectedIds.includes(String(a.id)))
    if (!selected.length) {
      window.alert('暂无已选达人')
      return
    }
    setNotifying(true)
    try {
      const entries = selected.map((a) => {
        const { talentMemberId } = { talentMemberId: resolveTalentMemberIdForApplicant(a, reg) }
        return {
          talentMemberId,
          title: '商家已选您参与探店招募',
          body: `您已被商家选入订单 ${order.id}。请扫码加入项目群，并在星选平台点击「确认」或「已进群」。`,
          category: 'order' as const,
          mpOrderId: mp.id,
          contact: a.contact,
          platformAccount: a.platformAccount,
          applicantId: a.id,
          imageUrl: groupQr,
          noticeType: 'selection' as const,
        }
      })
      const r = await appendTalentInboxOnOps(entries)
      if (!r.ok) throw new Error('通知发送失败')
      await patchRecruitmentOrderOnOps({ id: order.id, workflowStage: 'scheduling' })
      window.alert(`已向 ${entries.length} 位达人发送进群通知。`)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '通知失败')
    } finally {
      setNotifying(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <button type="button" onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="mr-1 h-4 w-4" />
          返回招募管理
        </button>
        <p className="text-sm text-gray-500">加载星选报名数据…</p>
      </div>
    )
  }
  if (!order || !mp) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <button type="button" onClick={onBack} className="text-sm text-gray-600">
          ← 返回
        </button>
        <p className="text-amber-800">未找到关联星选招募单。请先通过「发布招募」完成 AI 提单并发布至星选大厅。</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button type="button" onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">达人反选（星选报名）</h1>
          <p className="mt-1 text-sm text-gray-500">
            订单 {order.id} · 星选单 {mp.id} · 已报名 {applicants.length} 人
            {plan?.feeType === 'tier' ? ' · 按 AI 阶梯档位分别反选' : ' · 一口价模式'}
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm text-gray-600">
          <RefreshCw className="mr-1 inline h-4 w-4" />
          刷新
        </button>
      </div>

      {(['v3', 'v4', 'v5', 'v5plus'] as KolTierKey[]).map((tier) => {
        const cap = tierQuota(plan, tier)
        if (plan?.feeType === 'tier' && cap <= 0) return null
        const list = byTier[tier]
        const picked = list.filter((a) => selectedIds.includes(String(a.id))).length
        return (
          <div key={tier} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {kolTierLabel(tier)} 档 · 需选 {cap} 人
              </h3>
              <span className="text-sm text-blue-700">
                已选 {picked}/{cap} · 报名 {list.length} 人
              </span>
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-gray-500">该档位暂无报名</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {list.map((a) => {
                  const on = selectedIds.includes(String(a.id))
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(String(a.id), tier)}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{a.platformNickname || a.name}</p>
                        <p className="text-xs text-gray-500">
                          {a.followers?.toLocaleString('zh-CN')} 粉 · {a.douyinSalesLevel || '—'} · {a.quotePrice || '报价未填'}
                          {a.platformAccount ? (
                            <span className="ml-1 font-mono text-gray-400">· {a.platformAccount}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-400">
                          进群：
                          {a.groupJoinStatus === 'joined'
                            ? '已进群'
                            : a.groupJoinStatus === 'confirmed'
                              ? '已确认'
                              : '待确认'}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmSelection()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Check className="mr-1 inline h-4 w-4" />
          确认反选
        </button>
      </div>

      {order && mp ? (
        <>
          <RecruitmentXingxuanBridge mpOrderId={mp.id} variant="step" step="applicants" />
          <RecruitmentCpsSyncPanel
            order={order}
            mp={mp}
            selectedApplicantIds={selectedIds}
            onSynced={load}
          />
        </>
      ) : null}

      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-5">
        <h3 className="mb-2 flex items-center font-semibold text-violet-900">
          <QrCode className="mr-2 h-5 w-5" />
          项目群二维码
        </h3>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onUploadQr(f)
        }} />
        <div className="flex flex-wrap items-center gap-4">
          {groupQr ? (
            <img src={groupQr} alt="群码" className="h-28 w-28 rounded-lg border object-cover" />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed text-xs text-gray-400">
              未上传
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-violet-800"
          >
            上传群码
          </button>
          <button
            type="button"
            disabled={notifying}
            onClick={() => void notifySelected()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {notifying ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Send className="mr-1 inline h-4 w-4" />}
            通知已选达人
          </button>
        </div>
      </div>
    </div>
  )
}

/** 结算：确认打款 + 下载支付宝明细 */
export function MerchantRecruitmentPaymentView({ onBack }: { onBack: () => void }) {
  const [order, setOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [mp, setMp] = useState<RegistryMpRecruitmentOrder | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadWorkflowContext().then((c) => {
      setOrder(c.order)
      setMp(c.mp)
    })
  }, [])

  const selected = (mp?.applicants ?? []).filter((a) => a.merchantSelected || a.prSelected)
  const allVideosPassed =
    selected.length > 0 &&
    selected.every((a) => a.videoStatus === 'passed' || a.aiVerifyStatus === 'passed')

  const confirmPayment = async () => {
    if (!order) return
    if (!allVideosPassed) {
      window.alert('请先完成全部达人视频审核通过')
      return
    }
    setBusy(true)
    try {
      await patchRecruitmentOrderOnOps({
        id: order.id,
        paymentState: 'awaiting_ops_paid',
        workflowStage: 'payment_ops',
      })
      if (mp) {
        await patchMpRecruitmentOrderOnOps({ id: mp.id, status: 'pending_settlement' })
      }
      window.alert('已提交打款申请。请下载支付宝明细完成批量打款，运营确认后将通知达人。')
      const ctx = await loadWorkflowContext()
      setOrder(ctx.order)
      setMp(ctx.mp)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" onClick={onBack} className="flex items-center text-sm text-gray-600">
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">结算 · 确认打款</h1>
        <p className="mt-2 text-sm text-gray-600">
          视频全部通过后，确认打款并下载达人支付宝明细。运营在管控台点击「确认已打款」后，星选达人将收到到账通知。
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          <li className="flex justify-between border-b py-2">
            <span>已选达人</span>
            <span>{selected.length} 人</span>
          </li>
          <li className="flex justify-between border-b py-2">
            <span>视频审核</span>
            <span className={allVideosPassed ? 'text-emerald-700' : 'text-amber-700'}>
              {allVideosPassed ? '全部通过' : '未完成'}
            </span>
          </li>
          <li className="flex justify-between border-b py-2">
            <span>打款状态</span>
            <span>{order?.paymentState === 'paid' ? '已完结' : order?.paymentState === 'awaiting_ops_paid' ? '待运营确认' : '待商家确认'}</span>
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => order && exportAlipayCsv(selected, order.id)}
            className="inline-flex items-center rounded-lg border px-4 py-2 text-sm text-gray-700"
          >
            <Download className="mr-2 h-4 w-4" />
            下载支付宝明细
          </button>
          <button
            type="button"
            disabled={busy || order?.paymentState === 'awaiting_ops_paid' || order?.paymentState === 'paid'}
            onClick={() => void confirmPayment()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            结算 · 确认打款
          </button>
        </div>
      </div>
    </div>
  )
}

export function MerchantRecruitmentHubStats() {
  const [stats, setStats] = useState({ applicants: 0, selected: 0, stage: '' })
  useEffect(() => {
    void loadWorkflowContext().then((c) => {
      const n = c.mp?.applicants?.length ?? 0
      const sel = c.mp?.selectedApplicantIds?.length ?? 0
      setStats({ applicants: n, selected: sel, stage: c.order?.workflowStage ?? '' })
    })
  }, [])
  if (!stats.stage) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">
        <Users className="mr-1 h-3 w-3" />
        星选报名 {stats.applicants}
      </span>
      {stats.selected > 0 ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">已反选 {stats.selected}</span>
      ) : null}
    </div>
  )
}
