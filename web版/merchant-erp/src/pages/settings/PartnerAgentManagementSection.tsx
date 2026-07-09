import { Building2, Copy, Loader2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../cn'
import {
  createPartnerAgent,
  fetchPartnerAgents,
  type PartnerAgentListItem,
} from '../../services/partnerAgentsClient'
import { toUserFacingError } from '../../lib/userFacingError'

/** 总代：子代理公司管理（开通即同步星选 PR 账号，扣费走总代权益池） */
export default function PartnerAgentManagementSection() {
  const [companyName, setCompanyName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [rows, setRows] = useState<PartnerAgentListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [createdCreds, setCreatedCreds] = useState<{
    loginName: string
    tempPassword: string
    companyName: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setRows(await fetchPartnerAgents())
    } catch (e) {
      setErr(toUserFacingError(e, '加载子代理'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    setSubmitting(true)
    setErr(null)
    setCreatedCreds(null)
    try {
      const out = await createPartnerAgent({
        companyName: companyName.trim(),
        contactPhone: contactPhone.trim(),
      })
      setCreatedCreds({
        loginName: out.loginName,
        tempPassword: out.tempPassword,
        companyName: companyName.trim(),
      })
      setCompanyName('')
      setContactPhone('')
      await load()
    } catch (e) {
      setErr(toUserFacingError(e, '创建子代理'))
    } finally {
      setSubmitting(false)
    }
  }

  const copyCreds = async () => {
    if (!createdCreds) return
    const text = `子代理：${createdCreds.companyName}\n登录名：${createdCreds.loginName}\n初始密码：${createdCreds.tempPassword}\n登录地址：https://fws.mofangdianai.com/login`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-sm text-violet-950">
        创建子代理后自动开通星选 PR 账号（与 ERP 同手机号）。子代录入客户归属该子代；林客 SP 仍仅总代维护。
      </div>

      {createdCreds ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
          <p className="font-semibold">子代理已创建：{createdCreds.companyName}</p>
          <p className="mt-2">
            登录名 <code className="rounded bg-white/80 px-1">{createdCreds.loginName}</code> · 初始密码{' '}
            <code className="rounded bg-white/80 px-1">{createdCreds.tempPassword}</code>
          </p>
          <button
            type="button"
            onClick={() => void copyCreds()}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            复制邀请信息
          </button>
        </div>
      ) : null}

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      <section className="erp-panel p-6">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <UserPlus className="h-5 w-5 text-violet-600" />
          创建子代理
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">代理公司名称</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="例：华东一区服务商"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">负责人手机号</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="11 位手机号（未注册）"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={submitting || !companyName.trim() || contactPhone.trim().length < 11}
          onClick={() => void onCreate()}
          className={cn(
            'mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50',
          )}
        >
          {submitting ? '创建中…' : '创建并生成登录凭证'}
        </button>
      </section>

      <section className="erp-panel p-6">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Building2 className="h-5 w-5 text-slate-500" />
          已开通子代理
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">暂无子代理</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">公司</th>
                  <th className="py-2 pr-4 font-medium">负责人</th>
                  <th className="py-2 pr-4 font-medium">登录名</th>
                  <th className="py-2 pr-4 font-medium">客户数</th>
                  <th className="py-2 font-medium">开通时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenantId} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{r.name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.contactPhone ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.loginName ?? '—'}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{r.clientCount}</td>
                    <td className="py-2.5 text-slate-500">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : '—'}
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
