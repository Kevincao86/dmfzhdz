import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../cn'
import {
  countSubAccountsForJobRole,
  getJobRoleById,
  newJobRoleId,
  PERMISSION_MODULES,
  readJobRoles,
  removeJobRoleIfUnused,
  type JobRoleRecord,
  type PermissionKey,
  upsertJobRole,
} from '../../lib/subAccountsStorage'

export default function SubAccountPermissionsPanel() {
  const [roles, setRoles] = useState<JobRoleRecord[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [draft, setDraft] = useState<Set<PermissionKey>>(new Set())
  const [savedHint, setSavedHint] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameFor, setRenameFor] = useState<JobRoleRecord | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const permEditorRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(() => {
    const list = readJobRoles()
    setRoles(list)
    setSelectedRoleId((prev) => {
      if (prev && list.some((r) => r.id === prev)) return prev
      return list[0]?.id ?? ''
    })
  }, [])

  useEffect(() => {
    reload()
    const on = () => reload()
    window.addEventListener('meoo-job-roles-changed', on)
    window.addEventListener('meoo-subaccounts-changed', on)
    return () => {
      window.removeEventListener('meoo-job-roles-changed', on)
      window.removeEventListener('meoo-subaccounts-changed', on)
    }
  }, [reload])

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  )

  useEffect(() => {
    if (!selected) {
      setDraft(new Set())
      return
    }
    setDraft(new Set(selected.permissions))
  }, [selected])

  const toggle = (key: PermissionKey) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSavedHint(false)
  }

  const savePermissions = () => {
    if (!selected) return
    const permissions = PERMISSION_MODULES.map((m) => m.key).filter((k) => draft.has(k))
    upsertJobRole({ ...selected, permissions })
    setSavedHint(true)
    window.setTimeout(() => setSavedHint(false), 2000)
    reload()
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setNewRoleName('')
    setErr(null)
  }

  const submitCreate = () => {
    setErr(null)
    const name = newRoleName.trim()
    if (name.length < 2 || name.length > 32) {
      setErr('岗位名称为 2～32 个字符')
      return
    }
    const dup = roles.some((r) => r.name.toLowerCase() === name.toLowerCase())
    if (dup) {
      setErr('已存在同名岗位')
      return
    }
    const template = selected ? selected.permissions : []
    const row: JobRoleRecord = {
      id: newJobRoleId(),
      name,
      builtIn: false,
      permissions: [...template],
      createdAt: new Date().toISOString(),
    }
    upsertJobRole(row)
    setSelectedRoleId(row.id)
    reload()
    closeCreate()
  }

  const submitRename = () => {
    if (!renameFor) return
    setErr(null)
    const name = renameInput.trim()
    if (name.length < 2 || name.length > 32) {
      setErr('岗位名称为 2～32 个字符')
      return
    }
    const dup = roles.some((r) => r.id !== renameFor.id && r.name.toLowerCase() === name.toLowerCase())
    if (dup) {
      setErr('已存在同名岗位')
      return
    }
    upsertJobRole({ ...renameFor, name })
    setRenameFor(null)
    setRenameInput('')
    reload()
  }

  const onDeleteRole = (r: JobRoleRecord) => {
    if (r.builtIn) return
    const n = countSubAccountsForJobRole(r.id)
    if (n > 0) {
      window.alert(`该岗位下仍有 ${n} 个子账号，请先在「账号管理」中调整岗位后再删除。`)
      return
    }
    if (!window.confirm(`确定删除岗位「${r.name}」？`)) return
    if (removeJobRoleIfUnused(r.id)) {
      reload()
      setSelectedRoleId((prev) => (prev === r.id ? readJobRoles()[0]?.id ?? '' : prev))
    }
  }

  const editRole = (r: JobRoleRecord) => {
    setErr(null)
    setSelectedRoleId(r.id)
    setSavedHint(false)
    window.requestAnimationFrame(() => {
      permEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    if (!r.builtIn) {
      setRenameInput(r.name)
      setRenameFor(r)
    }
  }

  const deleteDisabledTitle = (r: JobRoleRecord, cnt: number): string => {
    if (r.builtIn) return '系统预置岗位不可删除'
    if (cnt > 0) return `仍有 ${cnt} 个子账号绑定该岗位，请先在「账号管理」中调整后再删`
    return '删除该岗位'
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">权限设置</h3>
        <p className="mt-1 text-sm text-gray-500">
          权限绑定在<strong className="font-medium text-gray-700">岗位</strong>
          上；子账号在「账号管理」中选择岗位后，即拥有该岗位权限。子账号仅支持账号密码登录。
        </p>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-500">
          暂无岗位数据。
        </div>
      ) : (
        <>
          <div ref={permEditorRef} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="job-role-perm-select" className="mb-1 block text-xs font-medium text-gray-700">
                  选择岗位
                </label>
                <select
                  id="job-role-perm-select"
                  value={selectedRoleId}
                  onChange={(e) => {
                    setSelectedRoleId(e.target.value)
                    setSavedHint(false)
                  }}
                  className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.builtIn ? '（系统预置）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={savePermissions}
                disabled={!selected}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                保存岗位权限
              </button>
              {savedHint ? <span className="text-sm text-green-600">已保存</span> : null}
            </div>

            {selected ? (
              <p className="mb-3 text-xs text-gray-500">
                当前岗位：「{selected.name}」；关联子账号 {countSubAccountsForJobRole(selected.id)} 个。
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PERMISSION_MODULES.map((m) => {
                const on = draft.has(m.key)
                return (
                  <label
                    key={m.key}
                    className={cn(
                      'flex cursor-pointer items-center rounded-lg border px-3 py-2.5 text-sm transition-colors',
                      on ? 'border-blue-200 bg-blue-50/80 text-blue-900' : 'border-gray-200 bg-gray-50/50 text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={on}
                      onChange={() => toggle(m.key)}
                    />
                    {m.label}
                  </label>
                )
              })}
            </div>

            <p className="mt-4 text-xs text-gray-500">
              修改系统预置岗位的权限后，所有绑定该岗位的子账号将一并生效。数据保存在本机浏览器。
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">岗位列表</h4>
              <button
                type="button"
                onClick={() => {
                  setErr(null)
                  setNewRoleName('')
                  setCreateOpen(true)
                }}
                className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                新增岗位
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2.5">岗位名称</th>
                    <th className="px-3 py-2.5">类型</th>
                    <th className="px-3 py-2.5">关联账号数</th>
                    <th className="px-3 py-2.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => {
                    const cnt = countSubAccountsForJobRole(r.id)
                    return (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
                        <td className="px-3 py-2.5 text-gray-600">{r.builtIn ? '系统预置' : '自定义'}</td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-700">{cnt}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editRole(r)}
                              className="inline-flex items-center text-blue-600 hover:underline"
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              编辑
                            </button>
                            <button
                              type="button"
                              disabled={r.builtIn || cnt > 0}
                              title={deleteDisabledTitle(r, cnt)}
                              onClick={() => onDeleteRole(r)}
                              className="inline-flex items-center text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900">新增岗位</h4>
              <button type="button" onClick={closeCreate} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              新岗位默认复制当前所选岗位「{getJobRoleById(selectedRoleId)?.name ?? '—'}」的权限勾选，创建后可在上方调整并保存。
            </p>
            <label className="mb-1 block text-xs font-medium text-gray-700">岗位名称</label>
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="例如：店长、区域运营"
            />
            {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {renameFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setRenameFor(null)
            setErr(null)
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-gray-900">编辑岗位</h4>
              <button
                type="button"
                onClick={() => {
                  setRenameFor(null)
                  setErr(null)
                }}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-700">岗位名称</label>
            <input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">功能权限请在上方勾选模块后点击「保存岗位权限」。</p>
            {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenameFor(null)
                  setErr(null)
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitRename}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
