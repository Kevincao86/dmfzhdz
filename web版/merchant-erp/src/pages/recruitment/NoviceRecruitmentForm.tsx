import { ChevronLeft, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import MeooPayQrModal from '../../components/MeooPayQrModal'
import { cn } from '../../cn'
import { buildErpRegistryTenant } from '../../lib/buildErpRegistryTenant'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../../lib/dbSchemaErrorHint'
import { loadRecruitmentIndustryL1Labels } from '../../lib/recruitmentIndustryOptions'
import { appendRecruitmentOrderToOps } from '../../lib/opsRegistryClient'
import type { RegistryRecruitmentOrder } from '../../lib/opsRegistryTypes'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { fetchPrimaryTenantId, fetchTenantWalletSummary, insertMerchantPaymentOrder } from '../../lib/tenantBilling'
import {
  generateNoviceKolAllocation,
  kolTierStrategyLabel,
  type KolTierStrategy,
  type NoviceAllocation,
} from '../../services/recruitmentNoviceAllocationAi'

function formatBudgetYuanForPrefill(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  const cents = Math.round(yuan * 100)
  return String(cents / 100)
}

type Props = {
  onBack: () => void
}

export default function NoviceRecruitmentForm({ onBack }: Props) {
  const [city, setCity] = useState('')
  const [industry, setIndustry] = useState('餐饮')
  const [industryOptions, setIndustryOptions] = useState<string[]>(['餐饮'])
  const [packageNote, setPackageNote] = useState('')
  const [budget, setBudget] = useState(0)
  const [recruitStart, setRecruitStart] = useState('')
  const [recruitEnd, setRecruitEnd] = useState('')
  const [visitStart, setVisitStart] = useState('')
  const [visitEnd, setVisitEnd] = useState('')
  const [strategy, setStrategy] = useState<KolTierStrategy>('more_v4')

  const [allocation, setAllocation] = useState<NoviceAllocation | null>(null)
  const [allocationFresh, setAllocationFresh] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)
  const [recruitRechargeOpen, setRecruitRechargeOpen] = useState(false)
  const [recruitRechargePrefillYuan, setRecruitRechargePrefillYuan] = useState('')
  const skipRecruitmentWalletCheckRef = useRef(false)

  useEffect(() => {
    let on = true
    void (async () => {
      const opts = await loadRecruitmentIndustryL1Labels()
      if (!on) return
      setIndustryOptions(opts)
      setIndustry((prev) => (opts.includes(prev) ? prev : opts[0] ?? '餐饮'))
    })()
    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    setAllocationFresh(false)
  }, [city, industry, packageNote, budget, strategy, recruitStart, recruitEnd, visitStart, visitEnd])

  const runAllocation = useCallback(async () => {
    setAiErr(null)
    if (!city.trim()) {
      setAiErr('请填写城市，便于按同城达人行情估算档位')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setAiErr('请填写总预算（大于 0）')
      return
    }
    setAiLoading(true)
    try {
      const res = await generateNoviceKolAllocation({
        city: city.trim(),
        industry,
        packageNote,
        budgetYuan: budget,
        strategy,
      })
      setAllocation(res)
      setAllocationFresh(true)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : '分配失败')
    } finally {
      setAiLoading(false)
    }
  }, [budget, city, industry, packageNote, strategy])

  const submit = async () => {
    setPushErr(null)
    if (!city.trim()) {
      setPushErr('请填写城市')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setPushErr('请填写总预算（大于 0）')
      return
    }
    if (!recruitStart.trim() || !recruitEnd.trim()) {
      setPushErr('请填写招募开始与结束时间')
      return
    }
    if (!visitStart.trim() || !visitEnd.trim()) {
      setPushErr('请填写探店开始与结束时间')
      return
    }
    if (!allocation || !allocationFresh) {
      setPushErr('请先点击「AI 智能分配达人档位」，并在修改预算或策略后重新分配')
      return
    }

    if (!skipRecruitmentWalletCheckRef.current) {
      if (supabaseConfigured && supabase) {
        try {
          const tid = await fetchPrimaryTenantId(supabase)
          if (tid) {
            const { balanceCents } = await fetchTenantWalletSummary(supabase, tid)
            const needCents = Math.round(Number(budget) * 100)
            if (needCents > 0 && balanceCents < needCents) {
              setRecruitRechargePrefillYuan(formatBudgetYuanForPrefill(budget))
              setRecruitRechargeOpen(true)
              return
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setPushErr(shouldSuggestDbMigration(msg) ? DB_MIGRATION_HINT_ZH : `无法校验钱包余额：${msg}`)
          return
        }
      }
    } else {
      skipRecruitmentWalletCheckRef.current = false
    }

    const tenant = buildErpRegistryTenant()
    const customerName = tenant?.merchantName ?? '店魔方 ERP 商户'
    const storeName = city.trim()
    const storeAddress = `${city.trim()} · ${industry}`
    const id = `RO-NV${Date.now()}`
    const tierLine = `V3:${allocation.v3} V4:${allocation.v4} V5:${allocation.v5} V5以上:${allocation.v5plus}`
    const order: RegistryRecruitmentOrder = {
      id,
      customerName,
      storeName,
      talentId: '—',
      talentName: '新手版·待 AI / 运营匹配',
      fans: allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus,
      accountType: '抖音',
      coopTimes: 0,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      status: 'pending',
      serviceAmount: budget,
      commissionPct: 15,
      netAmount: Math.round(Math.max(0, budget) * 0.85),
      storeAddress,
      category: industry,
      infoSummary: `【新手版·AI纯智能】城市:${city.trim()}；行业:${industry}；套餐:${packageNote.trim().slice(0, 200) || '—'}；预算¥${budget}；招募:${recruitStart}~${recruitEnd}；探店:${visitStart}~${visitEnd}；策略:${kolTierStrategyLabel(strategy)}；档位:${tierLine}；来源:${allocation.source === 'ai' ? '模型' : '离线估算'}；${allocation.costHint ?? ''}${allocation.notes ? `；说明:${allocation.notes}` : ''}`,
    }

    setSubmitting(true)
    try {
      await appendRecruitmentOrderToOps(order)
      try {
        window.localStorage.setItem('meoo_last_recruitment_order_id', id)
      } catch {
        /* ignore */
      }
      window.alert('新手版需求已推送至运营管控台「达人招募订单」，状态：待接单。')
      onBack()
    } catch (e) {
      const detail = e instanceof Error ? e.message.trim() : String(e)
      setPushErr(
        detail
          ? `推送失败：${detail.length > 280 ? `${detail.slice(0, 280)}…` : detail}`
          : '推送失败：请确认网络正常，且运营侧服务与数据同步已就绪。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const onRecruitmentRechargePaid = async (payload: { amountCents: number; payChannel: 'wechat' | 'alipay' }) => {
    if (!supabase) throw new Error('未配置 Supabase')
    const tid = await fetchPrimaryTenantId(supabase)
    if (!tid) throw new Error('未找到租户关联')
    await insertMerchantPaymentOrder(supabase, {
      tenantId: tid,
      orderKind: 'recharge',
      amountCents: payload.amountCents,
      payChannel: payload.payChannel,
    })
    skipRecruitmentWalletCheckRef.current = true
    setRecruitRechargeOpen(false)
    await submit()
  }

  const strategies: KolTierStrategy[] = ['more_v3', 'more_v4', 'more_v5']

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回版本选择
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">新手版 · AI 纯智能处理</h1>
            <p className="mt-1 text-sm text-gray-500">
              仅需填写城市、行业、套餐说明、总预算与时间段；AI 结合同城达人撮合成本习惯，给出 V3–V5+ 档位人数建议（支持三种偏好策略）。
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              城市 <span className="text-red-500">*</span>
            </label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="例如：成都"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              行业 <span className="text-red-500">*</span>
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {industryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">套餐 / 项目说明（供 AI 理解撮合成本）</label>
            <input
              value={packageNote}
              onChange={(e) => setPackageNote(e.target.value)}
              placeholder="例如：双人火锅套餐、美甲单次体验…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              总预算（元） <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={budget || ''}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="¥"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                招募开始 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={recruitStart}
                onChange={(e) => setRecruitStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                招募结束 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={recruitEnd}
                onChange={(e) => setRecruitEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                探店开始 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={visitStart}
                onChange={(e) => setVisitStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                探店结束 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={visitEnd}
                onChange={(e) => setVisitEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">档位偏好策略</p>
            <div className="flex flex-col gap-2">
              {strategies.map((s) => (
                <label
                  key={s}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
                    strategy === s ? 'border-blue-500 bg-blue-50/80' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <input
                    type="radio"
                    name="kol-strategy"
                    checked={strategy === s}
                    onChange={() => setStrategy(s)}
                    className="mt-1"
                  />
                  <span className="text-gray-800">{kolTierStrategyLabel(s)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void runAllocation()}
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-105 disabled:opacity-50"
            >
              {aiLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              AI 智能分配达人档位
            </button>
            {!allocationFresh && allocation ? (
              <span className="text-xs text-amber-600">表单已变更，请重新分配</span>
            ) : null}
          </div>

          {aiErr ? <p className="text-sm text-red-600">{aiErr}</p> : null}

          {allocation ? (
            <div
              className={cn(
                'rounded-xl border p-4',
                allocation.source === 'ai' ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-gray-50',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">达人档位分配结果</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    allocation.source === 'ai' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700',
                  )}
                >
                  {allocation.source === 'ai' ? 'AI 模型' : '离线估算'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ['V3', allocation.v3],
                    ['V4', allocation.v4],
                    ['V5', allocation.v5],
                    ['V5以上', allocation.v5plus],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-lg bg-white/80 px-3 py-2 text-center shadow-sm ring-1 ring-black/5">
                    <p className="text-sm font-semibold tracking-wide text-gray-800">{label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{n}</p>
                    <p className="text-[10px] text-gray-500">人</p>
                  </div>
                ))}
              </div>
              {allocation.costHint ? <p className="mt-3 text-xs text-gray-600">{allocation.costHint}</p> : null}
              {allocation.notes ? <p className="mt-1 text-xs text-gray-500">{allocation.notes}</p> : null}
            </div>
          ) : null}

          {pushErr ? <p className="text-sm text-red-600">{pushErr}</p> : null}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              提交需求
            </button>
          </div>
        </div>
      </div>

      <MeooPayQrModal
        open={recruitRechargeOpen}
        title="招募预算充值"
        mode="recharge"
        initialRechargeYuan={recruitRechargePrefillYuan}
        rechargeContextHint={
          recruitRechargePrefillYuan.trim()
            ? `账户余额不足以覆盖招募总预算。请按总预算等额充值 ¥${Number(recruitRechargePrefillYuan.replace(/,/g, '')).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}（已填入自定义金额，可依实际微调）；完成支付申报后继续提交需求。`
            : null
        }
        onClose={() => setRecruitRechargeOpen(false)}
        onCompletedPayment={(p) => void onRecruitmentRechargePaid(p)}
      />
    </div>
  )
}
