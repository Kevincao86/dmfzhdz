import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  fetchMerchants,
  mutateMerchant,
  readSession,
  type RegionalCity,
  type RegionalMerchantRow,
} from '../lib/api'

export default function MerchantsPage() {
  const session = readSession()
  const [rows, setRows] = useState<RegionalMerchantRow[]>([])
  const [cities, setCities] = useState<RegionalCity[]>(session?.cities ?? [])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [searchMode, setSearchMode] = useState(false)
  const [editionFilter, setEditionFilter] = useState<'all' | 'merchant' | 'partner'>('all')
  const [edit, setEdit] = useState<RegionalMerchantRow | null>(null)
  const [form, setForm] = useState({
    merchantName: '',
    accountStatus: 'normal',
    opsGiftDays: 0,
    registerCity: '',
    password: '',
  })
  const [formErr, setFormErr] = useState<string | null>(null)

  const reload = async (keyword?: string) => {
    const r = await fetchMerchants(keyword)
    if (!r.ok) {
      setErr(r.error)
      return
    }
    setErr(null)
    setRows(r.data.merchants)
    if (r.data.cities?.length) setCities(r.data.cities)
    setSearchMode(!!keyword?.trim())
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = useMemo(() => {
    if (editionFilter === 'all') return rows
    if (editionFilter === 'partner') {
      return rows.filter((r) => r.edition === 'partner' || r.edition === 'partner_agent')
    }
    return rows.filter((r) => r.edition === 'merchant' || !r.edition)
  }, [rows, editionFilter])

  if (!session?.permissions.includes('merchants')) {
    return <Navigate to="/" replace />
  }

  const openEdit = (m: RegionalMerchantRow) => {
    setEdit(m)
    setFormErr(null)
    setForm({
      merchantName: m.name,
      accountStatus: m.accountStatus || 'normal',
      opsGiftDays: m.opsGiftDays || 0,
      registerCity: m.city || m.registerCity || cities[0]?.city || '',
      password: '',
    })
  }

  const saveEdit = async () => {
    if (!edit) return
    setBusy(true)
    setFormErr(null)
    try {
      const r = await mutateMerchant({
        action: edit.inScope === false ? 'claim' : 'update',
        tenantId: edit.id,
        merchantName: form.merchantName,
        accountStatus: form.accountStatus,
        opsGiftDays: Number(form.opsGiftDays) || 0,
        registerCity: form.registerCity,
      })
      if (!r.ok) {
        setFormErr(r.error)
        return
      }
      if (form.password.trim().length >= 6) {
        const pw = await mutateMerchant({
          action: 'reset_password',
          tenantId: edit.id,
          password: form.password.trim(),
          registerCity: form.registerCity,
        })
        if (!pw.ok) {
          setFormErr(`资料已保存，但改密失败：${pw.error}`)
          return
        }
      }
      setEdit(null)
      await reload(searchMode ? q : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">名下商家</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          查看并编辑代理城市内的商家 ERP / FWS 账号。城市：
          {cities.map((c) => c.city).join('、') || '未配置'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索公司名认领/定位账号"
          className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void reload(q)}
          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          搜索
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setQ('')
            void reload()
          }}
          className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
        >
          本城列表
        </button>
        <select
          value={editionFilter}
          onChange={(e) => setEditionFilter(e.target.value as typeof editionFilter)}
          className="rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
        >
          <option value="all">全部类型</option>
          <option value="merchant">商家ERP</option>
          <option value="partner">FWS服务商</option>
        </select>
      </div>

      {searchMode ? (
        <p className="text-xs text-amber-200/90">
          搜索结果：不在本城的账号可编辑并指定归属城市后认领到名下。
        </p>
      ) : null}
      {err ? <p className="text-sm text-rose-400">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">城市</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">服务到期</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  {searchMode ? '未找到匹配账号' : '本城暂无商家 ERP / FWS 账号，可用上方搜索认领'}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-white">{m.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.editionLabel}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.city || '未归属'}</td>
                  <td className="px-4 py-3 text-[var(--good)]">{m.openStatus}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {m.serviceExpireAt
                      ? new Date(m.serviceExpireAt).toLocaleDateString('zh-CN')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {m.inScope === false ? '认领/编辑' : '查看/编辑'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">
              {edit.inScope === false ? '认领并编辑' : '编辑账号'} · {edit.editionLabel}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)] font-mono">{edit.id}</p>
            {formErr ? <p className="mt-2 text-xs text-rose-400">{formErr}</p> : null}
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-[var(--muted)]">
                公司名称
                <input
                  value={form.merchantName}
                  onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                归属城市（须在代理范围内）
                <select
                  value={form.registerCity}
                  onChange={(e) => setForm((f) => ({ ...f, registerCity: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                >
                  {cities.map((c) => (
                    <option key={`${c.province}|${c.city}`} value={c.city}>
                      {c.province} · {c.city}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                账号状态
                <select
                  value={form.accountStatus}
                  onChange={(e) => setForm((f) => ({ ...f, accountStatus: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                >
                  <option value="normal">正常</option>
                  <option value="disabled">停用</option>
                  <option value="frozen">冻结</option>
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                运营赠送天数
                <input
                  type="number"
                  min={0}
                  value={form.opsGiftDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, opsGiftDays: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                重置登录密码（留空不改）
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="至少 6 位"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || !form.registerCity}
                onClick={() => void saveEdit()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
