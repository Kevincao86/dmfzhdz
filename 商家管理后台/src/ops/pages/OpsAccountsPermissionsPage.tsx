import { KeyRound, Shield, Sliders, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchRegistry, patchTenant, type RegistryTenant } from '../opsRegistryApi'

const PRESET_ROLES = ['管理员', '运营', '客服', '财务', '门店负责人']

function tenantStatusLabel(s: RegistryTenant['accountStatus']): string {
  if (s === 'normal') return '正常'
  if (s === 'disabled') return '停用'
  return '冻结'
}

export default function OpsAccountsPermissionsPage() {
  const [tenants, setTenants] = useState<RegistryTenant[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [freezeDays, setFreezeDays] = useState('90')
  const [autoFreezeUnpaid, setAutoFreezeUnpaid] = useState(true)

  const loadTenants = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setTenants(r.tenants ?? [])
    } catch {
      setTenants([])
    }
  }, [])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  const rows = useMemo(() => {
    return tenants.map((t) => ({
      id: t.id,
      customerName: t.merchantName,
      loginName: t.loginName,
      accountKind:
        t.source === 'erp' ? 'ERP 注册' : t.source === 'supabase' ? 'Supabase' : '运营手工',
      status: tenantStatusLabel(t.accountStatus),
      accountStatus: t.accountStatus,
      lastLoginAt: t.updatedAt ? t.updatedAt.replace('T', ' ').slice(0, 19) : '—',
    }))
  }, [tenants])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(rows.map((r) => r.id)))
  }

  const batchSetAccountStatus = async (accountStatus: RegistryTenant['accountStatus']) => {
    const ids = [...selectedIds]
    if (ids.length === 0) {
      window.alert('请先勾选需要操作的租户行。')
      return
    }
    setBatchBusy(true)
    try {
      for (const id of ids) {
        const r = await patchTenant({ id, accountStatus })
        if (!r.ok) {
          window.alert(r.error ?? '更新失败')
          await loadTenants()
          return
        }
      }
      setSelectedIds(new Set())
      await loadTenants()
      window.alert('已写入注册表：所选租户账号状态已更新。')
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">账号与权限管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          全局租户列表来自 dev 注册表；批量启停将调用注册表 patch 接口。冻结规则与角色矩阵仍为配置说明（未接独立任务服务）。
        </p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Users className="h-4 w-4 text-indigo-400" />
          租户账号列表（注册表）
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => void batchSetAccountStatus('normal')}
            className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            批量启用（正常）
          </button>
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => void batchSetAccountStatus('disabled')}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          >
            批量停用
          </button>
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => void batchSetAccountStatus('frozen')}
            className="rounded-lg bg-amber-700/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            批量冻结
          </button>
          <button
            type="button"
            onClick={() =>
              window.alert(
                '当前为 dev 环境：批量重置密码需对接消息通道与密码哈希服务；此处不执行写操作。请在生产环境接入认证服务后启用。',
              )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            <KeyRound className="h-3.5 w-3.5" />
            批量重置密码
          </button>
          <button
            type="button"
            onClick={() => void loadTenants()}
            className="ml-auto text-xs text-indigo-400 hover:underline"
          >
            刷新
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={() => toggleSelectAll()}
                    className="rounded border-slate-600"
                  />
                </th>
                <th className="px-3 py-2.5">客户</th>
                <th className="px-3 py-2.5">登录账号</th>
                <th className="px-3 py-2.5">类型</th>
                <th className="px-3 py-2.5">状态</th>
                <th className="px-3 py-2.5">最近更新</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    暂无租户。请在 ERP 或「客户管理」创建商户后写入注册表。
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="rounded border-slate-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-300">{a.customerName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-200">{a.loginName}</td>
                    <td className="px-3 py-2 text-slate-400">{a.accountKind}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{a.status}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{a.lastLoginAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sliders className="h-4 w-4 text-amber-400" />
          账号冻结规则（可配置）
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoFreezeUnpaid}
              onChange={(e) => setAutoFreezeUnpaid(e.target.checked)}
              className="rounded border-slate-600 bg-slate-950 text-indigo-500"
            />
            欠费超过宽限期自动冻结登录
          </label>
          <div>
            <label className="mb-1 block text-xs text-slate-500">长期未登录自动冻结（天）</label>
            <input
              type="number"
              min={30}
              value={freezeDays}
              onChange={(e) => setFreezeDays(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          上述规则为界面占位；持久化需接入计费与任务调度。租户启停请以列表勾选 + 批量按钮为准（已写注册表）。
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Shield className="h-4 w-4 text-sky-400" />
          角色与权限
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          预设角色：{PRESET_ROLES.join('、')}。自定义角色可配置菜单与数据权限（如仅查看指定门店）；支持按客户 / 门店维度下发策略。
        </p>
        <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
          角色矩阵、数据范围编辑器与「按客户下发」在生产环境由权限服务渲染；此处为占位说明。
        </div>
      </section>
    </div>
  )
}
