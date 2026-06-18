import { AlertCircle, Link2, Loader2, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { readMerchantSession } from '../../lib/merchantSession'
import { usePartnerClients } from '../../context/PartnerClientContext'
import { isPartnerEdition } from '../../lib/appEdition'
import {
  douyinCpsCommissionRateFromPct,
  douyinCpsPlanNameFromRecruitment,
  douyinCpsPlanTimeRangeSec,
  extractDouyinTalentId,
  isLikelyDouyinTalentId,
  type CpsTalentDetailRow,
} from '../../lib/douyinCpsShared'
import { patchRecruitmentOrderOnOps } from '../../lib/opsRegistryClient'
import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from '../../lib/opsRegistryTypes'
import {
  fetchDouyinOrientedPlanTalentDetail,
  saveDouyinVideoOrientedPlan,
} from '../../services/douyinCpsApi'
import { getDouyinGoodsProductOnlineQuery } from '../../services/douyinProductApi'

type Props = {
  order: RegistryRecruitmentOrder
  mp: RegistryMpRecruitmentOrder
  selectedApplicantIds: string[]
  onSynced: () => void | Promise<void>
}

export default function RecruitmentCpsSyncPanel({
  order,
  mp,
  selectedApplicantIds,
  onSynced,
}: Props) {
  const partner = usePartnerClients()
  const hasDouyinToken = !!readMerchantSession('meoo_douyin_merchant_token')
  const partnerClientReady =
    isPartnerEdition() && partner.activeClient?.provider === 'douyin'
  const merchantDouyinReady = !isPartnerEdition() && hasDouyinToken
  const enabled =
    (partnerClientReady || merchantDouyinReady) &&
    (order.recruitmentPlatform === '抖音' || !order.recruitmentPlatform)
  const cpsLabel = isPartnerEdition() ? '林客 CPS' : '来客 CPS'

  const [productKeyword, setProductKeyword] = useState('')
  const [productSearching, setProductSearching] = useState(false)
  const [productHits, setProductHits] = useState<{ id: string; name: string }[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    () => order.cpsLinkage?.productIds ?? [],
  )
  const [merchantPhone, setMerchantPhone] = useState(order.cpsLinkage?.merchantPhone ?? '')
  const [commissionDays, setCommissionDays] = useState(
    String(order.cpsLinkage?.commissionDurationDays ?? 30),
  )
  const [manualDouyinIds, setManualDouyinIds] = useState<Record<string, string>>({})
  const [syncing, setSyncing] = useState(false)
  const [talentRows, setTalentRows] = useState<CpsTalentDetailRow[]>([])
  const [talentLoading, setTalentLoading] = useState(false)

  const selectedApplicants = useMemo(() => {
    const ids = new Set(selectedApplicantIds.map(String))
    return (mp.applicants ?? []).filter((a) => ids.has(String(a.id)))
  }, [mp.applicants, selectedApplicantIds])

  const douyinIdByApplicant = useCallback(
    (a: RegistryMpRecruitmentApplicant) => {
      const manual = manualDouyinIds[String(a.id)]?.trim()
      if (manual && isLikelyDouyinTalentId(manual)) return manual
      return extractDouyinTalentId(a)
    },
    [manualDouyinIds],
  )

  const resolvedDouyinIds = useMemo(
    () =>
      [...new Set(selectedApplicants.map(douyinIdByApplicant).filter(Boolean))] as string[],
    [selectedApplicants, douyinIdByApplicant],
  )

  const missingDouyin = selectedApplicants.filter((a) => !douyinIdByApplicant(a))

  useEffect(() => {
    if (order.cpsLinkage?.productIds?.length) {
      setSelectedProductIds(order.cpsLinkage.productIds)
    }
  }, [order.cpsLinkage?.productIds])

  if (!enabled) return null

  const searchProducts = async () => {
    const kw = productKeyword.trim()
    if (kw.length < 1) {
      window.alert('请输入商品名称关键词')
      return
    }
    setProductSearching(true)
    try {
      const r = await getDouyinGoodsProductOnlineQuery({ product_name: kw, count: 20 })
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      setProductHits(
        r.hits
          .map((h) => ({
            id: String(h.product_id || '').trim(),
            name: String(h.product_name || h.product_id || '').trim(),
          }))
          .filter((x) => x.id),
      )
    } finally {
      setProductSearching(false)
    }
  }

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 50 ? prev : [...prev, id],
    )
  }

  const refreshTalentDetail = async () => {
    const planId = order.cpsLinkage?.planId
    if (!planId || !resolvedDouyinIds.length) return
    setTalentLoading(true)
    try {
      const r = await fetchDouyinOrientedPlanTalentDetail({
        planId,
        douyinIds: resolvedDouyinIds,
      })
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      setTalentRows(r.rows)
    } finally {
      setTalentLoading(false)
    }
  }

  useEffect(() => {
    if (order.cpsLinkage?.syncStatus === 'synced' && order.cpsLinkage.planId) {
      void refreshTalentDetail()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planId 变更时拉一次
  }, [order.cpsLinkage?.planId, order.cpsLinkage?.syncStatus])

  const syncToDouyin = async () => {
    if (!selectedApplicants.length) {
      window.alert('请先反选达人后再同步 CPS')
      return
    }
    if (missingDouyin.length) {
      window.alert('部分已选达人缺少有效抖音号，请补全后再同步')
      return
    }
    if (!selectedProductIds.length) {
      window.alert('请至少选择一个客户团购商品')
      return
    }
    const phone = merchantPhone.trim()
    if (!/^1\d{10}$/.test(phone)) {
      window.alert('请填写 11 位商家联系电话')
      return
    }

    const commissionPct = order.commissionPct ?? 0
    const rate = douyinCpsCommissionRateFromPct(commissionPct)
    const { startSec, endSec } = douyinCpsPlanTimeRangeSec(order.scheduleMeta)
    const planName = douyinCpsPlanNameFromRecruitment(
      order.infoSummary?.split('；')[0]?.replace(/^招募：/, '') || order.customerName,
      order.id,
    )

    setSyncing(true)
    try {
      await patchRecruitmentOrderOnOps({
        id: order.id,
        cpsLinkage: {
          provider: 'douyin',
          planType: 'video_oriented',
          planId: order.cpsLinkage?.planId,
          productIds: selectedProductIds,
          douyinIds: resolvedDouyinIds,
          commissionRatePct: commissionPct,
          commissionDurationDays: Math.max(1, parseInt(commissionDays, 10) || 30),
          merchantPhone: phone,
          syncStatus: 'pending',
          lastSyncAt: new Date().toISOString(),
        },
      })

      const save = await saveDouyinVideoOrientedPlan({
        plan_id: order.cpsLinkage?.planId,
        plan_name: planName,
        merchant_phone: phone,
        douyin_id_list: resolvedDouyinIds,
        product_list: selectedProductIds.map((product_id) => ({
          product_id,
          commission_rate: rate,
        })),
        start_time: startSec,
        end_time: endSec,
        commission_duration: Math.max(1, parseInt(commissionDays, 10) || 30),
      })

      if (!save.ok) {
        await patchRecruitmentOrderOnOps({
          id: order.id,
          cpsLinkage: {
            provider: 'douyin',
            planType: 'video_oriented',
            productIds: selectedProductIds,
            douyinIds: resolvedDouyinIds,
            commissionRatePct: commissionPct,
            commissionDurationDays: Math.max(1, parseInt(commissionDays, 10) || 30),
            merchantPhone: phone,
            syncStatus: 'failed',
            lastError: save.message,
            lastSyncAt: new Date().toISOString(),
          },
        })
        window.alert(save.message)
        await onSynced()
        return
      }

      await patchRecruitmentOrderOnOps({
        id: order.id,
        cpsLinkage: {
          provider: 'douyin',
          planType: 'video_oriented',
          planId: save.planId,
          productIds: selectedProductIds,
          douyinIds: resolvedDouyinIds,
          commissionRatePct: commissionPct,
          commissionDurationDays: Math.max(1, parseInt(commissionDays, 10) || 30),
          merchantPhone: phone,
          syncStatus: 'synced',
          lastError: undefined,
          lastSyncAt: new Date().toISOString(),
        },
      })
      window.alert(
        order.cpsLinkage?.planId
          ? `已更新${cpsLabel}定向计划（plan_id=${save.planId}）`
          : `已创建${cpsLabel}定向计划（plan_id=${save.planId}）`,
      )
      await onSynced()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const linkage = order.cpsLinkage

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
      <h3 className="mb-1 flex items-center font-semibold text-amber-950">
        <Link2 className="mr-2 h-5 w-5" />
        {cpsLabel} 定向计划{isPartnerEdition() ? '（服务商 · 代运营客户）' : '（商家 · 抖音来客）'}
      </h3>
      <p className="mb-4 text-xs text-amber-900/80">
        {isPartnerEdition() ? (
          <>
            将反选达人同步至当前客户（
            {partner.activeClient?.clientLabel || partner.activeClient?.merchantAccountId || '—'}）的抖音短视频定向佣金计划。
          </>
        ) : (
          <>将反选达人同步至您绑定的抖音来客账户下的短视频定向佣金计划。</>
        )}
        需开放平台 <code className="rounded bg-white/80 px-1">poi.cps.common</code> 权限并已签署撮合协议。
      </p>

      {linkage?.syncStatus === 'synced' && linkage.planId ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
          已同步 · plan_id <span className="font-mono">{linkage.planId}</span>
          {linkage.lastSyncAt ? (
            <span className="ml-2 text-xs text-emerald-800/80">
              {new Date(linkage.lastSyncAt).toLocaleString('zh-CN')}
            </span>
          ) : null}
        </div>
      ) : null}

      {linkage?.syncStatus === 'failed' && linkage.lastError ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{linkage.lastError}</span>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">商家联系电话</span>
          <input
            value={merchantPhone}
            onChange={(e) => setMerchantPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11 位手机号"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-gray-700">佣金有效期（天）</span>
          <input
            value={commissionDays}
            onChange={(e) => setCommissionDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <p className="mb-2 text-sm font-medium text-gray-800">
        已选达人抖音号 · 佣金 {order.commissionPct ?? 0}%
      </p>
      <ul className="mb-4 divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white/60">
        {selectedApplicants.length === 0 ? (
          <li className="px-3 py-2 text-sm text-gray-500">请先反选达人</li>
        ) : (
          selectedApplicants.map((a) => {
            const id = douyinIdByApplicant(a)
            const ok = !!id
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-[8rem] font-medium text-gray-900">
                  {a.platformNickname || a.name}
                </span>
                {ok ? (
                  <span className="font-mono text-xs text-emerald-700">{id}</span>
                ) : (
                  <input
                    value={manualDouyinIds[String(a.id)] ?? ''}
                    onChange={(e) =>
                      setManualDouyinIds((m) => ({ ...m, [String(a.id)]: e.target.value.trim() }))
                    }
                    placeholder="补填抖音号（非昵称）"
                    className="min-w-[12rem] flex-1 rounded border border-amber-300 px-2 py-1 text-xs"
                  />
                )}
              </li>
            )
          })
        )}
      </ul>

      <div className="mb-3">
        <span className="mb-2 block text-sm font-medium text-gray-800">客户团购商品</span>
        <div className="flex flex-wrap gap-2">
          <input
            value={productKeyword}
            onChange={(e) => setProductKeyword(e.target.value)}
            placeholder="商品名称关键词"
            className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={productSearching}
            onClick={() => void searchProducts()}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {productSearching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-1 h-4 w-4" />
            )}
            搜索商品
          </button>
        </div>
        {productHits.length > 0 ? (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 text-sm">
            {productHits.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedProductIds.includes(p.id)}
                    onChange={() => toggleProduct(p.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500">{p.id}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {selectedProductIds.length > 0 ? (
          <p className="mt-2 text-xs text-gray-600">已选 {selectedProductIds.length} 个商品</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncToDouyin()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : null}
          {linkage?.planId ? '更新 CPS 定向计划' : `同步至${cpsLabel}`}
        </button>
        {linkage?.planId ? (
          <button
            type="button"
            disabled={talentLoading}
            onClick={() => void refreshTalentDetail()}
            className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${talentLoading ? 'animate-spin' : ''}`} />
            刷新带货数据
          </button>
        ) : null}
      </div>

      {talentRows.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2">抖音号</th>
                <th className="px-3 py-2">带货 GMV</th>
                <th className="px-3 py-2">已核销 GMV</th>
                <th className="px-3 py-2">达人佣金</th>
                <th className="px-3 py-2">短视频数</th>
              </tr>
            </thead>
            <tbody>
              {talentRows.map((r) => (
                <tr key={r.douyinId} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono">{r.douyinId}</td>
                  <td className="px-3 py-2">{fmtCent(r.gmv)}</td>
                  <td className="px-3 py-2">{fmtCent(r.usedGmv)}</td>
                  <td className="px-3 py-2">{fmtCent(r.talentCommission)}</td>
                  <td className="px-3 py-2">{r.shortVideoCnt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-500">
            金额单位为抖音接口返回值（一般为分），仅供运营参考，不与灵祺打款自动联动。
          </p>
        </div>
      ) : null}
    </div>
  )
}

function fmtCent(v?: number): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `¥${(v / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
