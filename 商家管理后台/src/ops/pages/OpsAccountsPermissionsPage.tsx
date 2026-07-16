import { Plus, Shield, Trash2, UserCog } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { cn } from '../../cn'
import SecretInput from '../../components/SecretInput'
import {
  createOpsSubAccount,
  deleteOpsSubAccount,
  ensureOpsMasterAccount,
  fetchOpsStaffAccountsRemote,
  hasOpsCloudSession,
  isSuperAdmin,
  migrateLocalOpsStaffToRemoteIfNeeded,
  OPS_MASTER_PHONE,
  reconnectOpsCloudSession,
  syncLocalOpsStaffToCloud,
  OPS_PERMISSION_MODULES,
  readOpsSession,
  refreshOpsSessionFromStorage,
  updateOpsSubAccount,
  type OpsPermissionKey,
  type OpsStaffAccount,
  type OpsDataScope,
  type OpsModuleGrant,
} from '../opsStaffAuth'
import { fetchRegistry } from '../opsRegistryApi'
import {
  buildCityOpts,
  buildProvinceOpts,
  toggleChip,
} from '../../meooRegistryShared/libraryRegionFilters'
import {
  dataScopeSummary,
  defaultDataScope,
  grantsSummary,
  uniquePermissionModules,
} from '../../meooRegistryShared/opsPermissionsV2'

const MODULE_ROWS = uniquePermissionModules(OPS_PERMISSION_MODULES)

function permissionLabels(a: OpsStaffAccount): string {
  if (a.role === 'super_admin') return '全部模块 · 编辑'
  const labelMap = new Map(MODULE_ROWS.map((m) => [m.key, m.label]))
  if (a.permissionGrants && Object.keys(a.permissionGrants).length) {
    return grantsSummary(a.permissionGrants, labelMap)
  }
  if (a.permissions.length === MODULE_ROWS.length) return '全部模块'
  return a.permissions.map((k) => labelMap.get(k) ?? k).join('、')
}

export default function OpsAccountsPermissionsPage() {
  const session = readOpsSession()
  const [staff, setStaff] = useState<OpsStaffAccount[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formPanelRef = useRef<HTMLElement | null>(null)

  const [form, setForm] = useState({
    phone: '',
    displayName: '',
    password: '',
    permissionGrants: {} as Partial<Record<OpsPermissionKey, OpsModuleGrant>>,
    dataScope: defaultDataScope() as OpsDataScope,
  })
  const [regionRows, setRegionRows] = useState<Array<{ province?: string; city?: string }>>([])

  const reloadStaff = useCallback(() => {
    void fetchOpsStaffAccountsRemote().then(setStaff)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureOpsMasterAccount()
      if (hasOpsCloudSession()) {
        await migrateLocalOpsStaffToRemoteIfNeeded()
      }
      if (!cancelled) await fetchOpsStaffAccountsRemote().then(setStaff)
    })()
    const onChange = () => reloadStaff()
    window.addEventListener('meoo-ops-staff-changed', onChange)
    return () => {
      cancelled = true
      window.removeEventListener('meoo-ops-staff-changed', onChange)
    }
  }, [reloadStaff])

  useEffect(() => {
    void fetchRegistry()
      .then((r) => {
        const pr = (r.mpPrUsers ?? []).map((u) => ({ province: u.province, city: u.city }))
        const tl = (r.talentLibraryEntries ?? []).map((u) => ({ province: u.province, city: u.city }))
        setRegionRows([...pr, ...tl])
      })
      .catch(() => setRegionRows([]))
  }, [])

  const provinceOpts = useMemo(() => buildProvinceOpts(regionRows), [regionRows])
  const cityOpts = useMemo(
    () => buildCityOpts(regionRows, form.dataScope.provinces),
    [regionRows, form.dataScope.provinces],
  )

  const editing = useMemo(
    () => (editId ? staff.find((a) => a.id === editId) ?? null : null),
    [editId, staff],
  )

  const subAccounts = useMemo(() => staff.filter((a) => a.role === 'sub_admin'), [staff])
  const master = useMemo(() => staff.find((a) => a.role === 'super_admin'), [staff])

  if (!session || !isSuperAdmin(session)) {
    return <Navigate to="/customers" replace />
  }

  const resetForm = () => {
    setForm({
      phone: '',
      displayName: '',
      password: '',
      permissionGrants: {},
      dataScope: defaultDataScope(),
    })
    setFormErr(null)
    setCreateOpen(false)
    setEditId(null)
  }

  const scrollFormIntoView = () => {
    window.setTimeout(() => {
      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  const openEdit = (a: OpsStaffAccount) => {
    setEditId(a.id)
    setCreateOpen(false)
    const grants: Partial<Record<OpsPermissionKey, OpsModuleGrant>> = { ...(a.permissionGrants ?? {}) }
    if (!Object.keys(grants).length) {
      for (const p of a.permissions) grants[p] = { view: true, edit: true }
    }
    setForm({
      phone: a.phone,
      displayName: a.displayName,
      password: '',
      permissionGrants: grants,
      dataScope: a.dataScope ?? defaultDataScope(),
    })
    setFormErr(null)
    scrollFormIntoView()
  }

  const toggleGrant = (key: OpsPermissionKey, field: 'view' | 'edit') => {
    setForm((f) => {
      const cur = f.permissionGrants[key] ?? { view: false, edit: false }
      let next = { ...cur }
      if (field === 'view') {
        next.view = !cur.view
        if (!next.view) next.edit = false
      } else {
        next.edit = !cur.edit
        if (next.edit) next.view = true
      }
      const permissionGrants = { ...f.permissionGrants, [key]: next }
      if (!next.view && !next.edit) {
        delete permissionGrants[key]
      }
      return { ...f, permissionGrants }
    })
  }

  const selectAllPermissions = () => {
    const permissionGrants: Partial<Record<OpsPermissionKey, OpsModuleGrant>> = {}
    for (const m of MODULE_ROWS) permissionGrants[m.key] = { view: true, edit: true }
    setForm((f) => ({ ...f, permissionGrants }))
  }

  const handleReconnectCloud = async () => {
    const session = readOpsSession()
    if (!session || session.role !== 'super_admin') return
    const password = window.prompt(
      `账号已是主号 ${session.phone}，但尚未连上云端数据库。\n\n请输入主账号密码以建立云端会话（非换号登录）：`,
    )
    if (!password) return
    setBusy(true)
    try {
      const r = await reconnectOpsCloudSession(session.phone, password)
      if (!r.ok) {
        const msg: Record<string, string> = {
          bad_password: '密码错误。主账号默认密码为 kaiyedaji888（非商家 ERP 密码）。',
          bad_credentials: '密码错误。主账号默认密码为 kaiyedaji888（非商家 ERP 密码）。',
          ops_staff_table_missing:
            '云端数据库缺少 ops_staff_accounts 表或权限未授予。请在轻量 ECS 执行：bash scripts/ecs-apply-ops-staff-accounts.sh',
          server_error:
            'ECS 接口返回 500（非密码问题）。请在轻量 ECS 执行 bash scripts/ecs-apply-ops-staff-accounts.sh，并查看 journalctl -u meoo-auth-api -n 30',
          cloud_login_failed:
            '无法连接 ECS（https://mofangdianai.com/erp-api）。请确认轻量 auth-api 已启动。',
        }
        const detail = 'detail' in r && typeof r.detail === 'string' ? r.detail : ''
        window.alert(
          detail && r.error === 'server_error'
            ? `${msg.server_error}\n\n详情：${detail}`
            : (msg[r.error] ?? `连接云端失败：${r.error}`),
        )
        return
      }
      reloadStaff()
      window.alert('已连接云端数据库，现在可以创建子账号并在其他浏览器登录。')
    } finally {
      setBusy(false)
    }
  }

  const handleSyncLocalToCloud = async () => {
    setBusy(true)
    try {
      const r = await syncLocalOpsStaffToCloud()
      if (!r.ok) {
        window.alert(
          r.error === 'cloud_session_required'
            ? '请先点「连接云端数据库」输入主账号密码，获得云端会话后再同步。'
            : `同步失败：${r.error}`,
        )
        return
      }
      reloadStaff()
      window.alert(
        r.imported > 0
          ? `已将 ${r.imported} 个子账号写入云端数据库，换浏览器后仍可见。`
          : '本机没有待同步的子账号（或云端已存在相同手机号）。',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!hasOpsCloudSession()) {
      setFormErr('请先点「连接云端数据库」输入主账号密码，确认已连上云端后再创建子账号。')
      return
    }
    setFormErr(null)
    setBusy(true)
    try {
      const r = await createOpsSubAccount({
        phone: form.phone,
        displayName: form.displayName,
        password: form.password,
        permissionGrants: form.permissionGrants,
        dataScope: form.dataScope,
      })
      if (!r.ok) {
        const msg: Record<string, string> = {
          invalid_phone: '请输入 11 位手机号',
          reserved_phone: '该号码为主账号保留',
          phone_exists: '该手机号已存在',
          password_too_short: '密码至少 6 位',
          permissions_required: '请至少勾选一个功能模块',
          cloud_session_required:
            '当前未连接云端数据库。请点「连接云端数据库」输入主账号密码后再创建子账号。',
        }
        setFormErr(msg[r.error] ?? r.error)
        return
      }
      resetForm()
      reloadStaff()
      if (r.cloudSynced) {
        await migrateLocalOpsStaffToRemoteIfNeeded()
        window.alert('子账号已创建并写入云端，其他设备可使用该手机号登录。')
      } else {
        window.alert(
          '子账号仅保存在本浏览器，其他同事无法登录。请主账号退出后用正确主号重新登录后再创建。',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const handleUpdate = async () => {
    if (!editId) return
    setFormErr(null)
    setBusy(true)
    try {
      const r = await updateOpsSubAccount(editId, {
        displayName: form.displayName,
        permissionGrants: form.permissionGrants,
        dataScope: form.dataScope,
        password: form.password.trim() || undefined,
      })
      if (!r.ok) {
        const msg: Record<string, string> = {
          permissions_required: '请至少勾选一个功能模块',
          password_too_short: '密码至少 6 位',
          cannot_edit_master: '无法修改主账号',
          cloud_session_required:
            '当前未连接云端数据库，密码修改仅会保存在本浏览器。请退出后用主账号 18768501283 重新登录后再重置。',
        }
        setFormErr(msg[r.error] ?? r.error)
        return
      }
      refreshOpsSessionFromStorage()
      resetForm()
      reloadStaff()
      if (r.cloudSynced) {
        window.alert('已保存到云端数据库，子账号可使用新密码登录。')
      } else {
        window.alert('已保存到本浏览器。其他设备无法使用新密码，请主账号重新云端登录后再重置。')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStatus = async (a: OpsStaffAccount) => {
    const next = a.status === 'active' ? 'disabled' : 'active'
    const label = next === 'disabled' ? '停用' : '启用'
    if (!window.confirm(`确定${label}子账号「${a.displayName}」？`)) return
    const r = await updateOpsSubAccount(a.id, { status: next })
    if (!r.ok) {
      window.alert('操作失败')
      return
    }
    reloadStaff()
  }

  const handleDelete = async (a: OpsStaffAccount) => {
    if (!window.confirm(`确定删除子账号「${a.displayName}」（${a.phone}）？`)) return
    const r = await deleteOpsSubAccount(a.id)
    if (!r.ok) {
      window.alert('删除失败')
      return
    }
    reloadStaff()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">账号与权限管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          管理运营管控台登录账号。主账号 {OPS_MASTER_PHONE} 拥有全部权限；可创建子账号并分配菜单模块。
        </p>
        {!hasOpsCloudSession() ? (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            <p>
              您已用主账号 <span className="font-mono">{OPS_MASTER_PHONE}</span> 登录，但<strong className="font-medium">尚未连上云端数据库</strong>
              （非账号错误）。运营台需经 ECS 读写子账号；此前请求走了 Vercel 接口无法访问轻量库，因此处于本机离线模式。子账号仅存在本浏览器，换设备后无法登录。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReconnectCloud()}
                className="rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
              >
                连接云端数据库
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSyncLocalToCloud()}
                className="rounded-md border border-amber-400/50 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
              >
                将本机子账号同步到云端
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-emerald-400/90">已连接云端数据库，新建的子账号可跨浏览器登录。</p>
        )}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Shield className="h-4 w-4 text-amber-400" />
          主账号
        </h2>
        {master ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
            <p className="font-medium text-amber-100">{master.displayName}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{master.phone}</p>
            <p className="mt-2 text-xs text-slate-500">全部功能模块 · 可创建与管理子账号</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <UserCog className="h-4 w-4 text-indigo-400" />
            运营子账号（{subAccounts.length}）
          </h2>
          <button
            type="button"
            disabled={!hasOpsCloudSession() || busy}
            title={hasOpsCloudSession() ? '' : '须先云端登录后再创建'}
            onClick={() => {
              resetForm()
              setCreateOpen(true)
              scrollFormIntoView()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            创建子账号
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">姓名</th>
                <th className="px-3 py-2.5">手机号</th>
                <th className="px-3 py-2.5">权限（查/编）</th>
                <th className="px-3 py-2.5">数据范围</th>
                <th className="px-3 py-2.5">状态</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {subAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    暂无子账号，点击「创建子账号」添加
                  </td>
                </tr>
              ) : (
                subAccounts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-200">{a.displayName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{a.phone}</td>
                    <td className="max-w-xs px-3 py-2 text-xs text-slate-400">
                      {permissionLabels(a)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {dataScopeSummary(a.dataScope ?? defaultDataScope())}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          a.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-slate-700 text-slate-400',
                        )}
                      >
                        {a.status === 'active' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="mr-2 text-xs text-indigo-400 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(a)}
                        className="mr-2 text-xs text-slate-400 hover:underline"
                      >
                        {a.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(a)}
                        className="inline-flex items-center gap-0.5 text-xs text-rose-400 hover:underline"
                      >
                        <Trash2 className="h-3 w-3" />
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen || editing ? (
        <section
          ref={formPanelRef}
          className="rounded-xl border border-indigo-500/40 bg-slate-900 p-5 pb-24"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-200">
              {editing ? `编辑子账号 · ${editing.phone}` : '新建子账号'}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void (editing ? handleUpdate() : handleCreate())}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? '保存中…' : editing ? '保存' : '创建'}
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
          <div className="grid gap-4 md:grid-cols-2">
            {!editing ? (
              <div>
                <label className="mb-1 block text-xs text-slate-500">手机号（登录账号）</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  placeholder="11 位手机号"
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-slate-500">显示名称</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                {editing ? '新密码（留空不修改）' : '登录密码'}
              </label>
              <SecretInput
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                placeholder={editing ? '不修改请留空' : '至少 6 位'}
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">功能模块 · 查看 / 编辑</span>
              <button type="button" onClick={selectAllPermissions} className="text-xs text-indigo-400 hover:underline">
                全部编辑
              </button>
            </div>
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-2 pr-3">模块</th>
                  <th className="py-2 px-2">查看</th>
                  <th className="py-2 px-2">编辑</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_ROWS.map((m) => {
                  const g = form.permissionGrants[m.key] ?? { view: false, edit: false }
                  return (
                    <tr key={m.key} className="border-t border-slate-800">
                      <td className="py-2 pr-3 text-slate-300">{m.label}</td>
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={g.view}
                          onChange={() => toggleGrant(m.key, 'view')}
                          className="rounded border-slate-600"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={g.edit}
                          onChange={() => toggleGrant(m.key, 'edit')}
                          className="rounded border-slate-600"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 text-xs font-medium text-slate-400">数据可见范围</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {(['national', 'provinces', 'cities'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      dataScope: {
                        ...f.dataScope,
                        mode,
                        provinces: mode === 'national' ? [] : f.dataScope.provinces,
                        cities: mode === 'cities' ? f.dataScope.cities : [],
                      },
                    }))
                  }
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs',
                    form.dataScope.mode === mode
                      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                      : 'border-slate-700 text-slate-400',
                  )}
                >
                  {mode === 'national' ? '全国' : mode === 'provinces' ? '指定省份' : '指定城市'}
                </button>
              ))}
            </div>
            {form.dataScope.mode !== 'national' ? (
              <>
                {form.dataScope.mode === 'provinces' || form.dataScope.mode === 'cities' ? (
                  <div className="mb-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {provinceOpts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            dataScope: {
                              ...f.dataScope,
                              provinces: toggleChip(f.dataScope.provinces, p),
                              cities: [],
                            },
                          }))
                        }
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[11px]',
                          form.dataScope.provinces.includes(p)
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                            : 'border-slate-700 text-slate-500',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : null}
                {form.dataScope.mode === 'cities' ? (
                  <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                    {cityOpts.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            dataScope: {
                              ...f.dataScope,
                              cities: toggleChip(f.dataScope.cities, c),
                            },
                          }))
                        }
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[11px]',
                          form.dataScope.cities.includes(c)
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                            : 'border-slate-700 text-slate-500',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {formErr ? <p className="mt-3 text-sm text-rose-400">{formErr}</p> : null}

          <div className="sticky bottom-0 z-20 -mx-5 mt-4 flex gap-2 border-t border-slate-800 bg-slate-900/95 px-5 py-3 backdrop-blur">
            <button
              type="button"
              disabled={busy}
              onClick={() => void (editing ? handleUpdate() : handleCreate())}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? '保存中…' : editing ? '保存' : '创建'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
