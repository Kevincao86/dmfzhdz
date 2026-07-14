import { BarChart3, Loader2, LogIn, Phone, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import {
  landingSurfaceLabel,
  subjectTypeLabel,
} from '../lib/distributionAttributionCore'
import { sendAuthSms } from '../lib/tenantRegisterApi'
import { toUserFacingError } from '../lib/userFacingError'
import {
  fetchSalespersonPortalBySms,
  formatCentsYuan,
  type SalespersonPortalResponse,
} from '../services/partnerDistributionStatsClient'

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PartnerSalespersonPortalPage() {
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [smsSending, setSmsSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [portal, setPortal] = useState<SalespersonPortalResponse | null>(null)

  useEffect(() => {
    if (smsCooldown <= 0) return
    const t = window.setTimeout(() => setSmsCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [smsCooldown])

  const onSendSms = async () => {
    const p = normalizePhone(phone)
    if (!/^1\d{10}$/.test(p)) {
      setErr('请输入有效大陆手机号')
      return
    }
    setSmsSending(true)
    setErr(null)
    try {
      const r = await sendAuthSms(p)
      if (!r.ok) {
        setErr(r.message ?? '发送验证码失败')
        return
      }
      setSmsCooldown(60)
    } catch (e) {
      setErr(toUserFacingError(e, '发送验证码'))
    } finally {
      setSmsSending(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const p = normalizePhone(phone)
    if (!/^1\d{10}$/.test(p)) {
      setErr('请输入有效大陆手机号')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入 6 位验证码')
      return
    }
    setSubmitting(true)
    setErr(null)
    try {
      const data = await fetchSalespersonPortalBySms({ phone: p, smsCode: smsCode.trim() })
      if (!data.ok) {
        setErr(data.message ?? data.error ?? '登录失败')
        return
      }
      setPortal(data)
    } catch (e) {
      setErr(toUserFacingError(e, '查看推广数据'))
    } finally {
      setSubmitting(false)
    }
  }

  if (portal?.ok && portal.salesperson && portal.stats) {
    const sp = portal.salesperson
    const stats = portal.stats
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">分销员数据看板</h1>
            <p className="mt-1 text-sm text-slate-500">
              {portal.partnerName ? `${portal.partnerName} · ` : ''}
              {sp.realName}（{sp.refCode}）
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPortal(null)}
            className="text-sm text-violet-600 hover:text-violet-700"
          >
            切换账号
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: '累计注册', value: String(stats.registrations) },
            { label: '已付费', value: String(stats.paidCount) },
            { label: '付费金额', value: formatCentsYuan(stats.paidAmountCents) },
            {
              label: 'ERP / 星选',
              value: `${stats.erp.registrations}/${stats.xingxuan.registrations}`,
            },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-violet-600" />
              推广明细（注册 / 付费）
            </h2>
          </div>
          {!portal.attributions?.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">暂无推广记录，分享链接后即可在此查看。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">对象</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">来源</th>
                    <th className="px-4 py-3 font-medium">注册时间</th>
                    <th className="px-4 py-3 font-medium">付费</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {portal.attributions.map((row) => (
                    <tr key={row.id}>
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

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50">
            <LogIn className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">分销员登录</h1>
            <p className="text-sm text-slate-500">使用登记手机号查看本人推广数据</p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-xs text-violet-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>验证码将发送至您在服务商处登记的手机号；仅可查看本人推广码带来的注册与付费数据。</p>
        </div>

        {err ? (
          <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
        ) : null}

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="text-slate-600">手机号</span>
            <div className="relative mt-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                placeholder="11 位大陆手机号"
                inputMode="numeric"
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">短信验证码</span>
            <div className="mt-1 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                inputMode="numeric"
              />
              <button
                type="button"
                disabled={smsSending || smsCooldown > 0}
                onClick={() => void onSendSms()}
                className={cn(
                  'shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm',
                  smsCooldown > 0 ? 'text-slate-400' : 'text-violet-700 hover:bg-violet-50',
                )}
              >
                {smsSending ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
              </button>
            </div>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            查看我的数据
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          服务商管理员请{' '}
          <Link to="/login" className="text-violet-600 hover:underline">
            登录 fws 后台
          </Link>{' '}
          查看全量看板
        </p>
      </div>
    </div>
  )
}
