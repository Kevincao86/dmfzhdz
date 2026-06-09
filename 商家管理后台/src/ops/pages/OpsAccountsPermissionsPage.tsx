import { Plus, Shield, Trash2, UserCog } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  OPS_PERMISSION_MODULES,
  readOpsSession,
  refreshOpsSessionFromStorage,
  updateOpsSubAccount,
  type OpsPermissionKey,
  type OpsStaffAccount,
} from '../opsStaffAuth'

function permissionLabels(keys: OpsPermissionKey[]): string {
  if (keys.length === OPS_PERMISSION_MODULES.length) return '全部模块'
  return keys
    .map((k) => OPS_PERMISSION_MODULES.find((m) => m.key === k)?.label ?? k)
    .join('、')
}

export default function OpsAccountsPermissionsPage() {
  const session = readOpsSession()
  const [staff, setStaff] = useState<OpsStaffAccount[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    phone: '',
    displayName: '',
    password: '',
    permissions: [] as OpsPermissionKey[],
  })

  const reloadStaff = useCallback(() => {
    void fetchOpsStaffAccountsRemote().then(setStaff)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureOpsMasterAccount()
      await migrateLocalOpsStaffToRemoteIfNeeded()
      if (!cancelled) await fetchOpsStaffAccountsRemote().then(setStaff)
    })()
    const onChange = () => reloadStaff()
    window.addEventListener('meoo-ops-staff-changed', onChange)
    return () => {
      cancelled = true
      window.removeEventListener('meoo-ops-staff-changed', onChange)
    }
  }, [reloadStaff])

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
    setForm({ phone: '', displayName: '', password: '', permissions: [] })
    setFormErr(null)
    setCreateOpen(false)
    setEditId(null)
  }

  const openEdit = (a: OpsStaffAccount) => {
    setEditId(a.id)
    setCreateOpen(false)
    setForm({
      phone: a.phone,
      displayName: a.displayName,
      password: '',
      permissions: [...a.permissions],
    })
    setFormErr(null)
  }

  const togglePermission = (key: OpsPermissionKey) => {
    setForm((f) => {
      const has = f.permissions.includes(key)
      return {
        ...f,
        permissions: has ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
      }
    })
  }

  const selectAllPermissions = () => {
    setForm((f) => ({
      ...f,
      permissions: OPS_PERMISSION_MODULES.map((m) => m.key),
    }))
  }

  const handleCreate = async () => {
    setFormErr(null)
    setBusy(true)
    try {
      const r = await createOpsSubAccount({
        phone: form.phone,
        displayName: form.displayName,
        password: form.password,
        permissions: form.permissions,
      })
      if (!r.ok) {
        const msg: Record<string, string> = {
          invalid_phone: '请输入 11 位手机号',
          reserved_phone: '该号码为主账号保留',
          phone_exists: '该手机号已存在',
          password_too_short: '密码至少 6 位',
          permissions_required: '请至少勾选一个功能模块',
          cloud_session_required:
            '当前未连接云端数据库。请退出后使用主账号重新登录（须出现云端会话），再创建子账号。',
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
        permissions: form.permissions,
        password: form.password.trim() || undefined,
      })
      if (!r.ok) {
        const msg: Record<string, string> = {
          permissions_required: '请至少勾选一个功能模块',
          password_too_short: '密码至少 6 位',
          cannot_edit_master: '无法修改主账号',
        }
        setFormErr(msg[r.error] ?? r.error)
        return
      }
      refreshOpsSessionFromStorage()
      resetForm()
      reloadStaff()
      window.alert('已保存')
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
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            当前为<strong className="font-medium">本机离线会话</strong>（未连接云端数据库）。此页面看到的子账号可能仅存在本浏览器，其他设备无法登录。请退出后使用主账号{' '}
            <span className="font-mono">{OPS_MASTER_PHONE}</span> 重新登录，再创建或编辑子账号。
          </p>
        ) : null}
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
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
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
                <th className="px-3 py-2.5">权限模块</th>
                <th className="px-3 py-2.5">状态</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {subAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    暂无子账号，点击「创建子账号」添加
                  </td>
                </tr>
              ) : (
                subAccounts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-200">{a.displayName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{a.phone}</td>
                    <td className="max-w-xs px-3 py-2 text-xs text-slate-400">
                      {permissionLabels(a.permissions)}
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
        <section className="rounded-xl border border-indigo-500/40 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">
            {editing ? `编辑子账号 · ${editing.phone}` : '新建子账号'}
          </h2>
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

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">可访问的功能模块</span>
              <button
                type="button"
                onClick={selectAllPermissions}
                className="text-xs text-indigo-400 hover:underline"
              >
                全选
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {OPS_PERMISSION_MODULES.map((m) => {
                const checked = form.permissions.includes(m.key)
                return (
                  <label
                    key={m.key}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                      checked
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(m.key)}
                      className="rounded border-slate-600"
                    />
                    {m.label}
                  </label>
                )
              })}
            </div>
          </div>

          {formErr ? <p className="mt-3 text-sm text-rose-400">{formErr}</p> : null}

          <div className="mt-4 flex gap-2">
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
