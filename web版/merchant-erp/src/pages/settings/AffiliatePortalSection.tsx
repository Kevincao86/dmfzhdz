import { Copy, ExternalLink, Loader2, Share2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import { affiliateStatusLabel } from '../../lib/distributionAffiliateApplyClient'
import {
  fetchAffiliatePortal,
  formatCentsYuan,
  type AffiliatePortalPayload,
} from '../../lib/distributionAffiliatePortalClient'
import { toUserFacingError } from '../../lib/userFacingError'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function settlementStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return '待确认'
    case 'confirmed':
      return '已确认'
    case 'paid':
      return '已打款'
    default:
      return status
  }
}

type Props = {
  /** 嵌入系统设置 Tab 时不显示顶部说明中的跳转 */
  embedded?: boolean
}

export default function AffiliatePortalSection({ embedded = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [data, setData] = useState<AffiliatePortalPayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const payload = await fetchAffiliatePortal()
      setData(payload)
    } catch (e) {
      setData(null)
      setErr(toUserFacingError(e, '加载推广中心'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCopy = async (text: string, label: string) => {
    const ok = await copyText(text)
    setHint(ok ? `已复制${label}` : `复制失败，请手动复制`)
    setTimeout(() => setHint(null), 2200)
  }

  const affiliate = data?.affiliate ?? null
  const wallet = data?.wallet
  const stats = data?.stats
  const links = data?.promoLinks

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-medium text-gray-900">我的推广</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          查看专属推广码、推广链接与佣金结算。未申请者可先提交推广员申请。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
          {!embedded ? (
            <p className="mt-2">
              <Link to="/login" className="font-medium text-red-900 underline">
                去登录
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {hint ? <p className="text-sm text-emerald-700">{hint}</p> : null}

      {!loading && !err && !affiliate ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
          <p className="text-sm text-slate-600">您尚未提交推广员申请。</p>
          <Link
            to="/affiliate/apply"
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            申请成为推广员
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      {!loading && !err && affiliate ? (
        <>
          <div
            className={cn(
              'rounded-xl border px-4 py-4 text-sm',
              affiliate.status === 'active'
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950'
                : 'border-amber-200 bg-amber-50/80 text-amber-950',
            )}
          >
            <p className="font-medium">状态：{affiliateStatusLabel(affiliate.status)}</p>
            <p className="mt-1 text-xs opacity-80">
              {affiliate.realName} · {affiliate.phone}
            </p>
            {affiliate.status === 'active' && affiliate.refCode ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-semibold tracking-wide">{affiliate.refCode}</span>
                <button
                  type="button"
                  onClick={() => void onCopy(affiliate.refCode!, '推广码')}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white/80 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制推广码
                </button>
              </div>
            ) : null}
            {affiliate.status === 'pending' ? (
              <p className="mt-2 text-xs">审核通过后，推广码与链接将在此展示。</p>
            ) : null}
            {affiliate.status === 'rejected' || affiliate.status === 'disabled' ? (
              <p className="mt-2 text-xs">
                如有疑问请联系运营；也可
                <Link to="/affiliate/apply" className="mx-1 font-medium underline">
                  重新申请
                </Link>
                。
              </p>
            ) : null}
          </div>

          {affiliate.status === 'active' && links ? (
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">推广链接</h4>
              <div className="space-y-2">
                {[
                  { key: 'cs', label: '商家 ERP 注册', url: links.cs },
                  { key: 'drPr', label: '星选 PR 注册', url: links.drPr },
                  { key: 'drTalent', label: '星选达人注册', url: links.drTalent },
                ].map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{row.label}</p>
                      <p className="truncate font-mono text-xs text-slate-800">{row.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onCopy(row.url, row.label)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </button>
                  </div>
                ))}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  小程序路径（供生成太阳码）：<span className="font-mono">{links.mpPath}</span>
                  <button
                    type="button"
                    onClick={() => void onCopy(links.mpPath, '小程序路径')}
                    className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {affiliate.status === 'active' && wallet && stats ? (
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">佣金概览</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: '可提现', value: `¥${formatCentsYuan(wallet.availableCents)}` },
                  { label: '冻结中', value: `¥${formatCentsYuan(wallet.frozenCents)}` },
                  { label: '已提现', value: `¥${formatCentsYuan(wallet.withdrawnCents)}` },
                  { label: '累计结算', value: `¥${formatCentsYuan(stats.settlementTotalCents)}` },
                ].map((cell) => (
                  <div key={cell.label} className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">{cell.label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{cell.value}</p>
                  </div>
                ))}
              </div>
              {stats.withdrawPendingCount > 0 ? (
                <p className="text-xs text-amber-700">
                  有 {stats.withdrawPendingCount} 笔提现申请审核中；已打款 ¥
                  {formatCentsYuan(stats.withdrawPaidCents)}。
                </p>
              ) : null}
            </section>
          ) : null}

          {affiliate.status === 'active' && (data?.settlements?.length ?? 0) > 0 ? (
            <section className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">近期结算</h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">周期</th>
                      <th className="px-3 py-2 font-medium">订单数</th>
                      <th className="px-3 py-2 font-medium">金额</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {data!.settlements.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">
                          {row.periodStart.slice(0, 10)} ~ {row.periodEnd.slice(0, 10)}
                        </td>
                        <td className="px-3 py-2">{row.orderCount}</td>
                        <td className="px-3 py-2 font-medium">¥{formatCentsYuan(row.totalCents)}</td>
                        <td className="px-3 py-2 text-xs">{settlementStatusLabel(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {!loading && !err ? (
        <p className="text-xs text-slate-500">
          提现申请与发票流程请联系运营；数据与运营台分销中心同步。
        </p>
      ) : null}
    </div>
  )
}
