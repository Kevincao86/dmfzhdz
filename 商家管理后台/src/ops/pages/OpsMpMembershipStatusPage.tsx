import { ArrowLeft, Check, Crown, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cn } from '../../cn'
import { MP_LIBRARY_ROLE_LABEL, type MpLibraryRole } from '../../meooRegistryShared/mpMembershipCatalog'
import {
  checkoutHistoryRowLabel,
  fetchMpMembershipStatus,
  formatMembershipExpiryLabel,
  resolveMembershipExpiryState,
} from '../opsMpMembershipStatusApi'
import { mpMembershipPayModeLabel, yuan } from '../opsMpMembershipFinanceApi'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function parseRole(raw: string | undefined): MpLibraryRole | null {
  const s = String(raw || '').trim()
  if (s === 'pr' || s === 'talent' || s === 'shoot' || s === 'edit') return s
  return null
}

function expiryBadgeClass(state: ReturnType<typeof resolveMembershipExpiryState>): string {
  if (state === 'active') return 'bg-emerald-500/15 text-emerald-300'
  if (state === 'expired') return 'bg-red-500/15 text-red-300'
  if (state === 'lifetime') return 'bg-slate-600 text-slate-300'
  return 'bg-amber-500/15 text-amber-300'
}

function expiryBadgeLabel(state: ReturnType<typeof resolveMembershipExpiryState>): string {
  if (state === 'active') return '生效中'
  if (state === 'expired') return '已过期'
  if (state === 'lifetime') return '免费档'
  return '未记录'
}

export default function OpsMpMembershipStatusPage() {
  const { role: roleParam, targetId: targetParam } = useParams()
  const role = parseRole(roleParam)
  const targetId = decodeURIComponent(String(targetParam || ''))

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [record, setRecord] = useState<Awaited<ReturnType<typeof fetchMpMembershipStatus>>['record']>(null)
  const [planLabel, setPlanLabel] = useState('')
  const [permissionRows, setPermissionRows] = useState<
    Awaited<ReturnType<typeof fetchMpMembershipStatus>>['permissionRows']
  >([])
  const [checkoutHistory, setCheckoutHistory] = useState<
    Awaited<ReturnType<typeof fetchMpMembershipStatus>>['checkoutHistory']
  >([])

  const load = useCallback(async () => {
    if (!role || !targetId) return
    setErr(null)
    setLoading(true)
    try {
      const data = await fetchMpMembershipStatus(role, targetId)
      setRecord(data.record)
      setPlanLabel(data.planLabel)
      setPermissionRows(data.permissionRows)
      setCheckoutHistory(data.checkoutHistory)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRecord(null)
    } finally {
      setLoading(false)
    }
  }, [role, targetId])

  useEffect(() => {
    void load()
  }, [load])

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, typeof permissionRows>()
    for (const row of permissionRows) {
      const list = map.get(row.group) ?? []
      list.push(row)
      map.set(row.group, list)
    }
    return [...map.entries()]
  }, [permissionRows])

  const expiryState = record
    ? resolveMembershipExpiryState(record.mpMembershipPlan, record.mpMembershipExpiresAt)
    : 'unknown'

  if (!role) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-slate-500">
        无效的身份类型
        <Link to="/mp-membership-finance" className="mt-4 block text-indigo-400 hover:underline">
          返回星选会员财务
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        加载会员状态…
      </div>
    )
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-slate-400">未找到该用户的会员档案，请返回财务页刷新后重试。</p>
        {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
        <Link to="/mp-membership-finance" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">
          返回星选会员财务
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          to="/mp-membership-finance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          返回星选会员财务
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Crown className="h-5 w-5 text-indigo-400" />
          会员状态
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {record.title}
          <span className="mx-2 text-slate-600">·</span>
          {record.subtitle}
          <span className="mx-2 text-slate-600">·</span>
          {MP_LIBRARY_ROLE_LABEL[record.role]}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
          <p className="text-xs text-[var(--ops-muted)]">当前档位</p>
          <p className="mt-1 text-lg font-semibold text-white">{planLabel}</p>
        </div>
        <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--ops-muted)]">会员到期</p>
            <span className={cn('rounded-full px-2 py-0.5 text-xs', expiryBadgeClass(expiryState))}>
              {expiryBadgeLabel(expiryState)}
            </span>
          </div>
          <p className="mt-1 text-lg font-semibold text-white">
            {formatMembershipExpiryLabel(record.mpMembershipPlan, record.mpMembershipExpiresAt)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
        <h2 className="text-sm font-medium text-white">当前开通权益</h2>
        <p className="mt-1 text-xs text-slate-500">以下为该档位已生效的权限项（含运营手动覆盖）</p>
        {groupedPermissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">暂无已开通权益（可能为基础免费档）</p>
        ) : (
          <div className="mt-4 space-y-4">
            {groupedPermissions.map(([group, rows]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{group}</p>
                <ul className="space-y-1.5">
                  {rows.map((row) => (
                    <li key={row.key} className="flex items-start gap-2 text-sm text-slate-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>
                        {row.label}
                        {row.effective && row.effective !== '—' ? (
                          <span className="ml-1 text-slate-400">· {row.effective}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
        <h2 className="text-sm font-medium text-white">支付 / 开通记录</h2>
        {checkoutHistory.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">暂无关联支付记录</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--ops-border)]/60">
            {checkoutHistory.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="text-slate-200">{checkoutHistoryRowLabel(row)}</p>
                  <p className="text-xs text-slate-500">
                    {fmtTime(row.paidAt || row.createdAt)}
                    {row.outTradeNo ? ` · ${row.outTradeNo}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{mpMembershipPayModeLabel(row.payMode)}</span>
              </li>
            ))}
          </ul>
        )}
        {checkoutHistory.some((r) => r.status === 'confirmed') ? (
          <p className="mt-2 text-xs text-slate-500">
            累计已确认 ¥
            {yuan(
              checkoutHistory
                .filter((r) => r.status === 'confirmed')
                .reduce((sum, r) => sum + r.amountCents, 0),
            )}
          </p>
        ) : null}
      </div>

      {err ? (
        <p className="flex items-center gap-1 text-sm text-red-400">
          <X className="h-4 w-4" />
          {err}
        </p>
      ) : null}
    </div>
  )
}
