import { ArrowLeft, FileText, MessageSquare, Store, Users, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cn } from '../../cn'
import type { CustomerAccountStatus, OpsCustomer } from '../mockData'
import { registryTenantToOpsCustomer } from '../mapRegistryTenant'
import { fetchRegistry, type RegistryTenant } from '../opsRegistryApi'
import {
  fetchSupabaseTenantsForOps,
  fetchTenantWalletLedgerForOps,
  type OpsWalletLedgerRow,
  supabaseRowsToRegistryTenants,
} from '../supabaseTenantsApi'

function payLabel(s: OpsCustomer['payStatus']): string {
  if (s === 'paid') return '已付费'
  if (s === 'overdue') return '欠费'
  return '待付'
}

function statusLabel(s: CustomerAccountStatus): string {
  if (s === 'normal') return '正常'
  if (s === 'disabled') return '停用'
  return '冻结'
}

function statusClass(s: CustomerAccountStatus): string {
  if (s === 'normal') return 'bg-emerald-500/15 text-emerald-400'
  if (s === 'disabled') return 'bg-slate-600 text-slate-300'
  return 'bg-amber-500/15 text-amber-400'
}

function sourceLabel(t: RegistryTenant): string {
  if (t.source === 'erp') return 'ERP 同步'
  if (t.source === 'supabase') return 'Supabase'
  return '运营创建'
}

function yuanFromCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadMergedTenants(): Promise<RegistryTenant[]> {
  let regTenants: RegistryTenant[] = []
  try {
    const reg = await fetchRegistry()
    regTenants = reg.tenants
  } catch {
    regTenants = []
  }
  let merged: RegistryTenant[] = [...regTenants]
  if (import.meta.env.VITE_SUPABASE_URL?.trim()) {
    const sb = await fetchSupabaseTenantsForOps()
    if (sb.ok) {
      const fromSb = supabaseRowsToRegistryTenants(sb.rows)
      const loginSet = new Set(fromSb.map((x) => x.loginName.trim().toLowerCase()))
      merged = [
        ...fromSb,
        ...regTenants.filter((t) => !loginSet.has(t.loginName.trim().toLowerCase())),
      ]
    }
  }
  return merged
}

export default function OpsCustomerDetailPage() {
  const { customerId } = useParams()
  const [tenant, setTenant] = useState<RegistryTenant | null | undefined>(undefined)
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [ledgerRows, setLedgerRows] = useState<OpsWalletLedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerErr, setLedgerErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!customerId) {
      setTenant(null)
      return
    }
    try {
      const merged = await loadMergedTenants()
      const hit = merged.find((x) => x.id === customerId)
      setTenant(hit ?? null)
    } catch {
      setTenant(null)
    }
  }, [customerId])

  useEffect(() => {
    void reload()
    const iv = window.setInterval(() => void reload(), 5000)
    return () => window.clearInterval(iv)
  }, [reload])

  const openLedgerModal = useCallback(async () => {
    if (!customerId || !tenant || tenant.source !== 'supabase') return
    setLedgerOpen(true)
    setLedgerLoading(true)
    setLedgerErr(null)
    setLedgerRows([])
    const r = await fetchTenantWalletLedgerForOps(customerId)
    setLedgerLoading(false)
    if (!r.ok) {
      setLedgerErr(r.hint ?? r.error)
      return
    }
    setLedgerRows(r.rows)
  }, [customerId, tenant])

  if (tenant === undefined) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-slate-500">
        加载中…
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-slate-400">
          未找到该客户（已合并查找注册表与 Supabase 租户）。请返回列表刷新后重试。
        </p>
        <Link to="/customers" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
          返回客户列表
        </Link>
      </div>
    )
  }

  const c = registryTenantToOpsCustomer(tenant)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/customers"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          客户列表
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-white">{c.companyName}</h1>
        <p className="mt-1 text-sm text-slate-500">客户 ID：{c.id}</p>
        <p className="mt-2">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
              statusClass(c.accountStatus),
            )}
          >
            {statusLabel(c.accountStatus)}
          </span>
          <span className="ml-2 text-xs text-slate-500">来源 · {sourceLabel(tenant)}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FileText className="h-4 w-4 text-indigo-400" />
            基本信息与资质
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">登录名</dt>
              <dd className="text-right text-slate-200">{tenant.loginName}</dd>
            </div>
            {tenant.authLoginEmail ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Auth 登录邮箱</dt>
                <dd className="break-all text-right text-slate-200">{tenant.authLoginEmail}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">联系人</dt>
              <dd className="text-slate-200">{c.contactName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">手机</dt>
              <dd className="text-slate-200">{c.phone}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">行业</dt>
              <dd className="text-slate-200">{c.industry}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">注册时间</dt>
              <dd className="text-slate-200">{c.registeredAt}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">最近更新</dt>
              <dd className="text-slate-200">{c.lastLoginAt}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">营业执照</dt>
              <dd className="truncate text-slate-300">{c.licenseNo ?? '— 未上传'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">套餐与账单</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">试用天数 / 正式权益天数</dt>
              <dd className="text-right text-slate-200">
                {tenant.trialDays} / {tenant.officialDays}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">当前套餐摘要</dt>
              <dd className="text-right text-slate-200">{c.planName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">到期时间</dt>
              <dd className="text-right text-slate-200">{c.planExpireAt}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">付费状态</dt>
              <dd className="text-slate-200">{payLabel(c.payStatus)}</dd>
            </div>
            {tenant.source === 'supabase' ? (
              <div className="flex justify-between gap-2 pt-2 border-t border-slate-800/80">
                <dt className="text-slate-500">可用余额</dt>
                <dd className="text-right font-semibold tabular-nums text-emerald-300">
                  ¥
                  {(typeof c.walletBalanceYuan === 'number'
                    ? c.walletBalanceYuan
                    : (tenant.walletBalanceCents ?? 0) / 100
                  ).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-slate-600">
            充值到账后余额在此展示；订阅订单在「订单管理」核对确认后将延长服务到期时间。
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">账号权限配置</h2>
          <p className="text-sm text-slate-500">
            可为客户分配子账号角色、功能模块与数据范围（按门店维度脱敏展示）。与商家端「系统设置」子账号能力对齐，由管理端统一写权限策略。
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">使用数据看板</h2>
          <p className="text-xs text-slate-500">近 7/30 天登录趋势、模块使用频次（演示占位）</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-400">
            <li>首登：{c.firstLoginAt}</li>
            <li>最近登录：{c.lastLoginAt}</li>
            <li>活跃天数：{c.activeDays}</li>
            <li>
              日活 / 周活 / 月活：{c.dau} / {c.wau} / {c.mau}
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Store className="h-4 w-4 text-emerald-400" />
            关联门店
          </h2>
          <p className="text-sm text-slate-300">
            共 {c.storeCount} 家门店 · {c.storeStatusSummary}
          </p>
          <p className="mt-2 text-xs text-slate-600">门店列表、POI 状态与平台绑定由门店中台接口提供。</p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Users className="h-4 w-4 text-pink-400" />
            关联达人
          </h2>
          <p className="text-sm text-slate-300">
            招募 {c.talentRecruitCount} 人 · 达人订单 {c.talentOrderCount} 单
          </p>
        </section>

        {tenant.source === 'supabase' ? (
          <button
            type="button"
            onClick={() => void openLedgerModal()}
            className={cn(
              'rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition-colors',
              'hover:border-slate-600 hover:bg-slate-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
            )}
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Wallet className="h-4 w-4 text-amber-400" />
              账户余额使用情况
            </h2>
            <p className="text-sm text-slate-300">
              当前可用余额{' '}
              <span className="font-semibold tabular-nums text-emerald-300">
                ¥{yuanFromCents(typeof tenant.walletBalanceCents === 'number' ? tenant.walletBalanceCents : 0)}
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500">点击查看充值入账、退款扣减等流水明细。</p>
          </button>
        ) : (
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Wallet className="h-4 w-4 text-slate-500" />
              账户余额使用情况
            </h2>
            <p className="text-sm text-slate-500">仅 Supabase 租户支持钱包与流水查询。</p>
          </section>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 md:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <MessageSquare className="h-4 w-4 text-sky-400" />
            客服会话记录
          </h2>
          <p className="text-sm text-slate-500">
            历史在线客服对话可按客户 / 时间 / 关键词检索；会话存储与坐席分配对接 IM 网关后启用。
          </p>
        </section>
      </div>

      {ledgerOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !ledgerLoading && setLedgerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="ledger-modal-title"
            className="flex max-h-[min(85vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h2 id="ledger-modal-title" className="text-lg font-semibold text-white">
                  使用明细
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  租户 {customerId?.slice(0, 8)}… · 钱包流水（最多 200 条）
                </p>
              </div>
              <button
                type="button"
                disabled={ledgerLoading}
                onClick={() => setLedgerOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                关闭
              </button>
            </div>
            <div className="min-h-[200px] flex-1 overflow-auto px-5 py-4">
              {ledgerLoading ? (
                <p className="py-12 text-center text-sm text-slate-500">加载中…</p>
              ) : ledgerErr ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{ledgerErr}</p>
              ) : ledgerRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">暂无流水记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-3 pr-3 font-medium">时间</th>
                      <th className="pb-3 pr-3 font-medium">变动</th>
                      <th className="pb-3 pr-3 font-medium">余额</th>
                      <th className="pb-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {ledgerRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-800/30">
                        <td className="whitespace-nowrap py-3 pr-3 text-slate-400">
                          {new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap py-3 pr-3 font-medium tabular-nums',
                            row.delta_cents >= 0 ? 'text-emerald-400' : 'text-rose-400',
                          )}
                        >
                          {row.delta_cents >= 0 ? '+' : ''}¥{yuanFromCents(Math.abs(row.delta_cents))}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-slate-300">
                          ¥{yuanFromCents(row.balance_after_cents)}
                        </td>
                        <td className="py-3 text-slate-400">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
