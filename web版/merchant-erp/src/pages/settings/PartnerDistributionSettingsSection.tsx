import { BarChart3, Copy, ExternalLink, Loader2, Share2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  landingSurfaceLabel,
  subjectTypeLabel,
} from '../../lib/distributionAttributionCore'
import { toUserFacingError } from '../../lib/userFacingError'
import {
  buildPartnerPromoLinks,
  fetchPartnerSalespersons,
  upsertPartnerSalesperson,
  type PartnerSalesperson,
} from '../../services/partnerSalespersonsClient'
import {
  fetchPartnerDistributionStats,
  formatCentsYuan,
  type PartnerDistributionStats,
  type PartnerSalespersonStatsRow,
} from '../../services/partnerDistributionStatsClient'

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statsForSalesperson(
  stats: PartnerDistributionStats | null,
  row: PartnerSalesperson,
): PartnerSalespersonStatsRow | null {
  if (!stats) return null
  return stats.bySalesperson.find((s) => s.salespersonId === row.id) ?? null
}

/** 服务商 fws：分销员配置 + 全量/单人数据看板 */
export default function PartnerDistributionSettingsSection() {
  const [rows, setRows] = useState<PartnerSalesperson[]>([])
  const [stats, setStats] = useState<PartnerDistributionStats | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [realName, setRealName] = useState('')
  const [phone, setPhone] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [listData, statsData] = await Promise.all([
        fetchPartnerSalespersons(),
        fetchPartnerDistributionStats(),
      ])
      setRows(listData.salespersons)
      setPartnerName(listData.partnerName)
      setStats(statsData)
    } catch (e) {
      setErr(toUserFacingError(e, '加载分销数据'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totals = stats?.totals

  const onCreate = async () => {
    const name = realName.trim()
    const p = normalizePhone(phone)
    const code = employeeCode.trim()
    if (!name || name.length < 2) {
      setErr('请填写分销员姓名')
      return
    }
    if (!/^1\d{10}$/.test(p)) {
      setErr('请填写有效大陆手机号')
      return
    }
    if (!code || code.length < 1) {
      setErr('请填写工号（用于生成推广码）')
      return
    }
    setSubmitting(true)
    setErr(null)
    setHint(null)
    try {
      const sp = await upsertPartnerSalesperson({
        realName: name,
        phone: p,
        employeeCode: code,
      })
      setHint(`已创建分销员，推广码 ${sp.refCode}`)
      setRealName('')
      setPhone('')
      setEmployeeCode('')
      await load()
    } catch (e) {
      setErr(toUserFacingError(e, '创建分销员'))
    } finally {
      setSubmitting(false)
    }
  }

  const onToggleStatus = async (row: PartnerSalesperson) => {
    setErr(null)
    setHint(null)
    try {
      await upsertPartnerSalesperson({
        id: row.id,
        realName: row.realName,
        phone: row.phone,
        employeeCode: row.employeeCode,
        status: row.status === 'active' ? 'disabled' : 'active',
      })
      setHint(row.status === 'active' ? '已停用该分销员' : '已重新启用')
      await load()
    } catch (e) {
      setErr(toUserFacingError(e, '更新状态'))
    }
  }

  const onCopyLinks = async (row: PartnerSalesperson) => {
    const links = buildPartnerPromoLinks(row.refCode)
    const text = [
      `分销员：${row.realName}（${row.refCode}）`,
      `ERP 商家：${links.cs}`,
      `星选 PR：${links.drPr}`,
      `星选达人：${links.drTalent}`,
      `星选小程序：${links.mpPath}`,
    ].join('\n')
    const ok = await copyText(text)
    setHint(ok ? `已复制 ${row.realName} 的推广链接` : '复制失败，请手动选择文本')
  }

  const recentRows = useMemo(() => stats?.recentAttributions ?? [], [stats])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-sm text-violet-950">
        <p className="font-medium">分销设置 · 配置、素材与数据</p>
        <p className="mt-1 text-violet-900/90">
          在此新建分销员并复制推广链接。客户通过链接在 <strong>cs</strong>（ERP）或{' '}
          <strong>dr / 星选小程序</strong> 注册后会计入下方看板；付费成功后自动显示付费数据。
          {partnerName ? ` 当前服务商：${partnerName}` : ''}
        </p>
        <p className="mt-2">
          <Link
            to="/partner/salesperson-portal"
            className="inline-flex items-center gap-1 font-medium text-violet-700 hover:text-violet-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            分销员自助登录（查看本人数据）
          </Link>
        </p>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{hint}</p>
      ) : null}

      <section className="erp-panel p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <BarChart3 className="h-5 w-5 text-violet-600" />
          全量数据看板
        </h3>
        {loading && !totals ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载统计…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: '累计注册', value: String(totals?.registrations ?? 0) },
              { label: '已付费用户', value: String(totals?.paidCount ?? 0) },
              { label: '付费总额', value: formatCentsYuan(totals?.paidAmountCents ?? 0) },
              {
                label: 'ERP 注册 / 星选注册',
                value: `${totals?.erp.registrations ?? 0} / ${totals?.xingxuan.registrations ?? 0}`,
              },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="erp-panel p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <UserPlus className="h-5 w-5 text-violet-600" />
          新增分销员
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-600">姓名</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="与对内结算一致"
              maxLength={32}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">手机号</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value))}
              placeholder="11 位大陆手机号"
              inputMode="numeric"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">工号</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.replace(/\s/g, '').slice(0, 16))}
              placeholder="例：A01"
              maxLength={16}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void onCreate()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          创建并生成推广码
        </button>
      </section>

      <section className="erp-panel overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Share2 className="h-5 w-5 text-violet-600" />
            分销员列表
          </h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-violet-600 hover:text-violet-700"
          >
            刷新
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            加载中…
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">暂无分销员，请先在上方新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">姓名</th>
                  <th className="px-4 py-3 font-medium">手机</th>
                  <th className="px-4 py-3 font-medium">工号</th>
                  <th className="px-4 py-3 font-medium">推广码</th>
                  <th className="px-4 py-3 font-medium">注册数</th>
                  <th className="px-4 py-3 font-medium">付费数</th>
                  <th className="px-4 py-3 font-medium">付费金额</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const rowStats = statsForSalesperson(stats, row)
                  return (
                    <tr key={row.id} className="bg-white">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.realName}</td>
                      <td className="px-4 py-3 text-slate-600">{row.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{row.employeeCode}</td>
                      <td className="px-4 py-3 font-mono text-xs text-violet-700">{row.refCode}</td>
                      <td className="px-4 py-3 text-slate-700">{rowStats?.registrations ?? 0}</td>
                      <td className="px-4 py-3 text-slate-700">{rowStats?.paidCount ?? 0}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatCentsYuan(rowStats?.paidAmountCents ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            row.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {row.status === 'active' ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void onCopyLinks(row)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            复制链接
                          </button>
                          <button
                            type="button"
                            onClick={() => void onToggleStatus(row)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            {row.status === 'active' ? '停用' : '启用'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="erp-panel overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">最近推广记录</h3>
          <p className="mt-1 text-xs text-slate-500">通过分销链接注册的用户；付费后自动更新金额</p>
        </div>
        {!recentRows.length ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">暂无推广注册记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">分销员</th>
                  <th className="px-4 py-3 font-medium">对象</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">来源</th>
                  <th className="px-4 py-3 font-medium">注册时间</th>
                  <th className="px-4 py-3 font-medium">付费</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRows.map((row) => (
                  <tr key={row.id} className="bg-white">
                    <td className="px-4 py-3 text-slate-700">{row.salespersonName || row.refCode}</td>
                    <td className="px-4 py-3 text-slate-800">{row.subjectLabel || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{subjectTypeLabel(row.subjectType)}</td>
                    <td className="px-4 py-3 text-slate-600">{landingSurfaceLabel(row.landingSurface)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(row.boundAt)}</td>
                    <td className="px-4 py-3">
                      {row.firstPaidAt ? (
                        <span className="font-medium text-emerald-700">
                          {formatCentsYuan(row.paidAmountCents ?? 0)}
                        </span>
                      ) : (
                        <span className="text-slate-400">未付费</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
