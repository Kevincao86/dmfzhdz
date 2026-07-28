import { MapPin, Plus, Percent, Building2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { cn } from '../../cn'
import SecretInput from '../../components/SecretInput'
import { toggleChip } from '../../meooRegistryShared/libraryRegionFilters'
import {
  CHINA_ADMIN_DIVISIONS,
  CHINA_PROVINCES,
  citiesOfProvinces,
  findProvinceOfCity,
} from '../../meooRegistryShared/chinaAdminDivisions'
import {
  canAccessOpsPath,
  hasOpsCloudSession,
  isSuperAdmin,
  readOpsSession,
  sessionHasPermission,
} from '../opsStaffAuth'
import {
  apiListRegionalPartners,
  apiMutateRegionalPartner,
  REGIONAL_PARTNER_MODULES,
  type RegionalCity,
  type RegionalPartner,
  type RegionalPartnerModuleKey,
} from '../regionalPartnersApi'

function cityKey(c: RegionalCity): string {
  return `${c.province}|${c.city}`
}

function formatShare(n: number): string {
  return `${Math.round(n * 1000) / 10}%`
}

export default function OpsRegionalPartnersPage() {
  const session = readOpsSession()
  const allowed =
    !!session &&
    (isSuperAdmin(session) ||
      sessionHasPermission(session, 'regional_partners') ||
      canAccessOpsPath(session, '/regional-partners'))

  const [partners, setPartners] = useState<RegionalPartner[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([])
  const [cityQuery, setCityQuery] = useState('')
  const [assignTenantId, setAssignTenantId] = useState('')

  const [form, setForm] = useState({
    phone: '',
    companyName: '',
    password: '',
    cities: [] as RegionalCity[],
    permissions: ['dashboard', 'merchants', 'settlement', 'pricing'] as RegionalPartnerModuleKey[],
    partnerShareRate: 0.8,
    note: '',
    status: 'active' as 'active' | 'disabled',
  })

  const reload = useCallback(async () => {
    const r = await apiListRegionalPartners()
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setErr(null)
    setPartners(r.partners)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const cityOpts = useMemo(() => {
    const q = cityQuery.trim()
    let rows = citiesOfProvinces(selectedProvinces)
    if (q) {
      rows = rows.filter(
        (r) => r.city.includes(q) || r.province.includes(q) || r.city.replace(/市$/, '').includes(q),
      )
    }
    return rows
  }, [selectedProvinces, cityQuery])

  if (!session) return <Navigate to="/login" replace />
  if (!allowed) return <Navigate to="/" replace />

  const resetForm = () => {
    setFormOpen(false)
    setEditId(null)
    setFormErr(null)
    setAssignTenantId('')
    setSelectedProvinces([])
    setCityQuery('')
    setForm({
      phone: '',
      companyName: '',
      password: '',
      cities: [],
      permissions: ['dashboard', 'merchants', 'settlement', 'pricing'],
      partnerShareRate: 0.8,
      note: '',
      status: 'active',
    })
  }

  const openCreate = () => {
    resetForm()
    setFormOpen(true)
  }

  const openEdit = (p: RegionalPartner) => {
    setFormOpen(true)
    setEditId(p.id)
    setFormErr(null)
    setCityQuery('')
    setForm({
      phone: p.phone,
      companyName: p.companyName,
      password: '',
      cities: p.cities,
      permissions: p.permissions.length ? p.permissions : ['dashboard'],
      partnerShareRate: p.partnerShareRate,
      note: p.note,
      status: p.status,
    })
    setSelectedProvinces([...new Set(p.cities.map((c) => c.province).filter(Boolean))])
  }

  const toggleCity = (row: RegionalCity) => {
    const next: RegionalCity = {
      province: row.province || findProvinceOfCity(row.city, selectedProvinces),
      city: row.city,
    }
    setForm((f) => {
      const exists = f.cities.some((c) => cityKey(c) === cityKey(next))
      if (exists) {
        return { ...f, cities: f.cities.filter((c) => cityKey(c) !== cityKey(next)) }
      }
      return { ...f, cities: [...f.cities, next] }
    })
  }

  const selectAllVisibleCities = () => {
    setForm((f) => {
      const map = new Map(f.cities.map((c) => [cityKey(c), c]))
      for (const row of cityOpts) {
        map.set(cityKey(row), { province: row.province, city: row.city })
      }
      return { ...f, cities: [...map.values()] }
    })
  }

  const clearSelectedCities = () => {
    setForm((f) => ({ ...f, cities: [] }))
  }

  const togglePerm = (key: RegionalPartnerModuleKey) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((k) => k !== key)
        : [...f.permissions, key],
    }))
  }

  const handleSave = async () => {
    if (!hasOpsCloudSession()) {
      setFormErr('请先用主账号完成云端登录（会话令牌）后再操作')
      return
    }
    if (!form.cities.length) {
      setFormErr('请至少选择 1 个代理城市（可跨省多选）')
      return
    }
    setBusy(true)
    setFormErr(null)
    try {
      const platformShareRate = Math.round((1 - form.partnerShareRate) * 10000) / 10000
      const body: Record<string, unknown> = editId
        ? {
            action: 'update',
            id: editId,
            companyName: form.companyName,
            cities: form.cities,
            permissions: form.permissions,
            partnerShareRate: form.partnerShareRate,
            platformShareRate,
            note: form.note,
            status: form.status,
            ...(form.password.trim() ? { password: form.password } : {}),
          }
        : {
            action: 'create',
            phone: form.phone,
            companyName: form.companyName,
            password: form.password,
            cities: form.cities,
            permissions: form.permissions,
            partnerShareRate: form.partnerShareRate,
            platformShareRate,
            note: form.note,
          }
      const r = await apiMutateRegionalPartner(body)
      if (!r.ok) {
        setFormErr(r.error)
        return
      }
      resetForm()
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const handleAssign = async () => {
    if (!editId || !assignTenantId.trim()) return
    setBusy(true)
    try {
      const r = await apiMutateRegionalPartner({
        action: 'assign_merchant',
        partnerId: editId,
        tenantId: assignTenantId.trim(),
        attributionCity: form.cities[0]?.city,
      })
      if (!r.ok) {
        setFormErr(r.error)
        return
      }
      setAssignTenantId('')
      window.alert('已绑定商家到该区域服务商')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStatus = async (p: RegionalPartner) => {
    const next = p.status === 'active' ? 'disabled' : 'active'
    if (!window.confirm(`确定${next === 'disabled' ? '停用' : '启用'}「${p.companyName}」？`)) return
    const r = await apiMutateRegionalPartner({ action: 'update', id: p.id, status: next })
    if (!r.ok) {
      window.alert(r.error)
      return
    }
    await reload()
  }

  /** 最小方案：运营台直接设新密码，供区域服务商忘记密码时重置 */
  const handleResetPassword = async (p: RegionalPartner) => {
    if (!hasOpsCloudSession()) {
      window.alert('请先用主账号完成云端登录后再操作')
      return
    }
    const pwd = window.prompt(`重置「${p.companyName}」登录密码（至少 6 位）`)
    if (pwd == null) return
    const password = pwd.trim()
    if (password.length < 6) {
      window.alert('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const r = await apiMutateRegionalPartner({ action: 'update', id: p.id, password })
      if (!r.ok) {
        window.alert(r.error)
        return
      }
      window.alert(`已重置密码，请通知对方用新密码登录：${p.phone}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">区域服务商</h1>
        <p className="mt-1 text-sm text-slate-500">
          开通城市代理账号；可跨省勾选多家城市代理，配置门户权限与分成比例。门户：adqf.mofangdianai.com
        </p>
        {!hasOpsCloudSession() ? (
          <p className="mt-2 text-xs text-amber-300/90">
            当前无云端会话令牌，请退出后用主账号重新登录再操作。
          </p>
        ) : null}
        {err ? <p className="mt-2 text-xs text-rose-400">加载失败：{err}</p> : null}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Building2 className="h-4 w-4 text-indigo-400" />
            账号列表（{partners.length}）
          </h2>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            新增区域服务商
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">公司</th>
                <th className="px-3 py-2.5">手机号</th>
                <th className="px-3 py-2.5">城市</th>
                <th className="px-3 py-2.5">分成</th>
                <th className="px-3 py-2.5">权限</th>
                <th className="px-3 py-2.5">状态</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {partners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    暂无区域服务商
                  </td>
                </tr>
              ) : (
                partners.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-200">{p.companyName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{p.phone}</td>
                    <td className="max-w-[220px] px-3 py-2 text-xs text-slate-400">
                      {p.cities.length
                        ? `${p.cities.length} 城：${p.cities.map((c) => c.city).join('、')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-300">
                      代理 {formatShare(p.partnerShareRate)} / 平台{' '}
                      {formatShare(p.platformShareRate)}
                    </td>
                    <td className="max-w-[160px] px-3 py-2 text-xs text-slate-400">
                      {p.permissions.join('、')}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          p.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-slate-700 text-slate-400',
                        )}
                      >
                        {p.status === 'active' ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="mr-2 text-indigo-400 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResetPassword(p)}
                        className="mr-2 text-amber-300/90 hover:underline disabled:opacity-40"
                      >
                        重置密码
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(p)}
                        className="text-slate-400 hover:underline"
                      >
                        {p.status === 'active' ? '停用' : '启用'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen ? (
        <section className="rounded-xl border border-indigo-500/40 bg-slate-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-200">
              {editId ? `编辑 · ${form.phone}` : '新建区域服务商'}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSave()}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
            </div>
          </div>

          {formErr ? <p className="mb-3 text-xs text-rose-400">{formErr}</p> : null}

          <div className="grid gap-4 md:grid-cols-2">
            {!editId ? (
              <div>
                <label className="mb-1 block text-xs text-slate-500">手机号（登录账号）</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-slate-500">公司名称</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                {editId ? '新密码（留空不改）' : '登录密码'}
              </label>
              <SecretInput
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs text-slate-500">
                <Percent className="h-3 w-3" />
                代理分成比例（平台 = 1 − 代理）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.partnerShareRate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      partnerShareRate: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                />
                <span className="text-xs text-slate-400">
                  代理 {formatShare(form.partnerShareRate)} · 平台{' '}
                  {formatShare(1 - form.partnerShareRate)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs text-slate-500">备注</label>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs font-medium text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                城市代理范围（可多选多城；同城仅一家启用中的区域服务商）
              </div>
              <span className="text-[11px] text-slate-500">
                全国 {CHINA_PROVINCES.length} 省 / {CHINA_ADMIN_DIVISIONS.length} 市 · 已选{' '}
                {form.cities.length} 城
              </span>
            </div>
            <p className="mb-2 text-[11px] text-slate-500">
              先点省份筛选（可多省），再勾选城市；支持跨省拿多家城市代理。
            </p>
            <div className="mb-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => setSelectedProvinces([])}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  selectedProvinces.length === 0
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                    : 'border-slate-700 text-slate-500',
                )}
              >
                全部省份
              </button>
              {CHINA_PROVINCES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedProvinces((prev) => toggleChip(prev, p))}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px]',
                    selectedProvinces.includes(p)
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                      : 'border-slate-700 text-slate-500',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="搜索城市，如 杭州 / 成都"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={selectAllVisibleCities}
                className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                全选当前列表
              </button>
              <button
                type="button"
                onClick={clearSelectedCities}
                className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
              >
                清空已选
              </button>
            </div>
            <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
              {cityOpts.map((row) => {
                const selected = form.cities.some((x) => cityKey(x) === cityKey(row))
                return (
                  <button
                    key={cityKey(row)}
                    type="button"
                    onClick={() => toggleCity(row)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px]',
                      selected
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                        : 'border-slate-700 text-slate-500',
                    )}
                    title={row.province}
                  >
                    {row.city}
                  </button>
                )
              })}
            </div>
            {form.cities.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.cities.map((c) => (
                  <button
                    key={cityKey(c)}
                    type="button"
                    onClick={() => toggleCity(c)}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100"
                    title="点击移除"
                  >
                    {c.province ? `${c.province}·` : ''}
                    {c.city} ×
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-amber-300/80">请至少选择 1 个代理城市</p>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">门户模块权限</div>
            <div className="flex flex-wrap gap-3">
              {REGIONAL_PARTNER_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(m.key)}
                    onChange={() => togglePerm(m.key)}
                    className="rounded border-slate-600"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {editId ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="mb-2 text-xs font-medium text-slate-400">绑定名下商家（tenant UUID）</div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={assignTenantId}
                  onChange={(e) => setAssignTenantId(e.target.value)}
                  placeholder="tenants.id"
                  className="min-w-[240px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
                />
                <button
                  type="button"
                  disabled={busy || !assignTenantId.trim()}
                  onClick={() => void handleAssign()}
                  className="rounded-lg border border-indigo-500/40 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-40"
                >
                  绑定
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
