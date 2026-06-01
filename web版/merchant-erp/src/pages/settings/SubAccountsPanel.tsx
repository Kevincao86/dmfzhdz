import { KeyRound, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import SecretInput from '../../components/SecretInput'
import { cn } from '../../cn'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import {
  hashPassword,
  readJobRoles,
  readSubAccounts,
  removeSubAccount,
  type JobRoleRecord,
  type SubAccountRecord,
  upsertSubAccount,
} from '../../lib/subAccountsStorage'

function newId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function SubAccountsPanel() {
  const [accounts, setAccounts] = useState<SubAccountRecord[]>([])
  const [jobRoles, setJobRoles] = useState<JobRoleRecord[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [resetFor, setResetFor] = useState<SubAccountRecord | null>(null)
  const [form, setForm] = useState({
    loginName: '',
    password: '',
    confirm: '',
    jobRoleId: '',
  })
  const [resetPwd, setResetPwd] = useState({ password: '', confirm: '' })
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reload = useCallback(() => {
    setAccounts(readSubAccounts())
    setJobRoles(readJobRoles())
  }, [])

  useEffect(() => {
    reload()
    const on = () => reload()
    window.addEventListener('meoo-subaccounts-changed', on)
    window.addEventListener('meoo-job-roles-changed', on)
    return () => {
      window.removeEventListener('meoo-subaccounts-changed', on)
      window.removeEventListener('meoo-job-roles-changed', on)
    }
  }, [reload])

  const openCreate = () => {
    setErr(null)
    const roles = readJobRoles()
    setForm({
      loginName: '',
      password: '',
      confirm: '',
      jobRoleId: roles[0]?.id ?? '',
    })
    setCreateOpen(true)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setErr(null)
    setForm({ loginName: '', password: '', confirm: '', jobRoleId: jobRoles[0]?.id ?? '' })
  }

  const submitCreate = async () => {
    setErr(null)
    const loginName = form.loginName.trim()
    if (loginName.length < 2 || loginName.length > 32) {
      setErr('登录账号长度为 2～32 个字符')
      return
    }
    if (!/^[\w\u4e00-\u9fa5-]+$/.test(loginName)) {
      setErr('登录账号仅支持字母、数字、下划线、中文与连字符')
      return
    }
    if (accounts.some((a) => a.loginName === loginName)) {
      setErr('该登录账号已存在')
      return
    }
    if (!form.jobRoleId || !readJobRoles().some((r) => r.id === form.jobRoleId)) {
      setErr('请选择有效岗位')
      return
    }
    if (form.password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (form.password !== form.confirm) {
      setErr('两次输入的密码不一致')
      return
    }
    if (!supabaseConfigured || !supabase) {
      setErr('当前环境未配置 Supabase，无法创建可登录子账号。')
      return
    }
    const { data: sessWrap } = await supabase.auth.getSession()
    const token = sessWrap.session?.access_token
    if (!token) {
      setErr('请先使用主账号登录后再创建子账号。')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meoo-tenant-subaccount-mutate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'create', loginName, password: form.password }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; cloudUserId?: string }
      if (!res.ok || !j.ok) {
        setErr(typeof j.message === 'string' ? j.message : `创建失败（HTTP ${res.status}）`)
        return
      }
      const passwordHash = await hashPassword(form.password)
      const row: SubAccountRecord = {
        id: newId(),
        loginName,
        passwordHash,
        jobRoleId: form.jobRoleId,
        status: 'active',
        createdAt: new Date().toISOString(),
        cloudUserId: typeof j.cloudUserId === 'string' ? j.cloudUserId : undefined,
      }
      upsertSubAccount(row)
      reload()
      closeCreate()
    } finally {
      setSubmitting(false)
    }
  }

  const submitReset = async () => {
    if (!resetFor) return
    setErr(null)
    if (resetPwd.password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (resetPwd.password !== resetPwd.confirm) {
      setErr('两次输入的密码不一致')
      return
    }
    if (!supabaseConfigured || !supabase) {
      setErr('当前环境未配置 Supabase，无法同步重置登录密码。')
      return
    }
    const { data: sessWrap } = await supabase.auth.getSession()
    const token = sessWrap.session?.access_token
    if (!token) {
      setErr('请先使用主账号登录后再重置密码。')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meoo-tenant-subaccount-mutate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'reset_password',
          loginName: resetFor.loginName,
          password: resetPwd.password,
          cloudUserId: resetFor.cloudUserId,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      if (!res.ok || !j.ok) {
        setErr(typeof j.message === 'string' ? j.message : `重置失败（HTTP ${res.status}）`)
        return
      }
      const passwordHash = await hashPassword(resetPwd.password)
      upsertSubAccount({
        ...resetFor,
        passwordHash,
      })
      reload()
      setResetFor(null)
      setResetPwd({ password: '', confirm: '' })
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = (row: SubAccountRecord) => {
    upsertSubAccount({
      ...row,
      status: row.status === 'active' ? 'disabled' : 'active',
    })
    reload()
  }

  const onDelete = async (row: SubAccountRecord) => {
    if (!window.confirm(`确定删除子账号「${row.loginName}」？此操作不可恢复。`)) return
    if (supabaseConfigured && supabase) {
      const { data: sessWrap } = await supabase.auth.getSession()
      const token = sessWrap.session?.access_token
      if (!token) {
        window.alert('请先使用主账号登录后再删除子账号（需同步删除云端登录）。')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/meoo-tenant-subaccount-mutate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'delete',
            loginName: row.loginName,
            cloudUserId: row.cloudUserId,
          }),
        })
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string }
        if (!res.ok || !j.ok) {
          window.alert(typeof j.message === 'string' ? j.message : `删除失败（HTTP ${res.status}）`)
          return
        }
      } finally {
        setSubmitting(false)
      }
    }
    removeSubAccount(row.id)
    reload()
  }

  const changeJobRole = (row: SubAccountRecord, jobRoleId: string) => {
    if (!readJobRoles().some((r) => r.id === jobRoleId)) return
    upsertSubAccount({ ...row, jobRoleId })
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-gray-900">账号管理</h3>
          <p className="mt-1 text-sm text-gray-500">
            创建子账号并绑定<strong className="font-medium text-gray-700">岗位</strong>
            ；权限随岗位在「权限设置」中维护。运营端手动创建的账户同步后，会出现在下表中，可在此管理岗位、停用与重置子账号密码。
            <strong className="font-medium text-gray-700"> 主账号</strong>
            修改登录密码请使用右上角头像 → <strong className="font-medium text-gray-700">个人设置</strong>。
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={jobRoles.length === 0 || submitting}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="mr-2 h-4 w-4" />
          创建子账号
        </button>
      </div>

      {jobRoles.length === 0 ? (
        <p className="text-sm text-amber-800">暂无岗位，请先在「权限设置」中等待系统预置岗位加载完成。</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">登录账号</th>
              <th className="px-4 py-3">岗位</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  暂无子账号，请点击「创建子账号」。
                </td>
              </tr>
            ) : (
              accounts.map((e) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.loginName}</td>
                  <td className="px-4 py-3">
                    <select
                      value={e.jobRoleId}
                      onChange={(ev) => changeJobRole(e, ev.target.value)}
                      className="max-w-[14rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                      aria-label="岗位"
                    >
                      {jobRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs',
                        e.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {e.status === 'active' ? '正常' : '已停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(e)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {e.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErr(null)
                          setResetPwd({ password: '', confirm: '' })
                          setResetFor(e)
                        }}
                        className="inline-flex items-center text-sm text-blue-600 hover:underline"
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        重置密码
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(e)}
                        className="text-red-500 hover:text-red-600"
                        aria-label="删除"
                      >
                        <Trash2 className="inline h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900">创建子账号</h4>
              <button type="button" onClick={closeCreate} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              创建后会在 Supabase 注册同名租户邮箱账号，子账号使用<strong className="font-medium text-gray-700"> 登录账号 + 密码</strong>
              在登录页登录；岗位与权限仍保存在本机浏览器。
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">登录账号</label>
                <input
                  value={form.loginName}
                  onChange={(e) => setForm((f) => ({ ...f, loginName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="字母、数字、下划线或中文"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">岗位</label>
                <select
                  value={form.jobRoleId}
                  onChange={(e) => setForm((f) => ({ ...f, jobRoleId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {jobRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.builtIn ? '（系统预置）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">密码（至少 6 位）</label>
                <SecretInput
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">确认密码</label>
                <SecretInput
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitCreate()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '提交中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setResetFor(null)
            setErr(null)
            setResetPwd({ password: '', confirm: '' })
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900">重置密码</h4>
              <button
                type="button"
                onClick={() => {
                  setResetFor(null)
                  setErr(null)
                  setResetPwd({ password: '', confirm: '' })
                }}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              账号：<span className="font-medium text-gray-900">{resetFor.loginName}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">新密码（至少 6 位）</label>
                <SecretInput
                  value={resetPwd.password}
                  onChange={(e) => setResetPwd((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">确认新密码</label>
                <SecretInput
                  value={resetPwd.confirm}
                  onChange={(e) => setResetPwd((f) => ({ ...f, confirm: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setResetFor(null)
                  setErr(null)
                  setResetPwd({ password: '', confirm: '' })
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitReset()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '提交中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
