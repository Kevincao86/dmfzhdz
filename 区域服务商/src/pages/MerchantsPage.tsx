import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  fetchMerchants,
  MEMBERSHIP_PLAN_OPTIONS,
  mutateMerchant,
  readSession,
  type MembershipPlan,
  type RegionalCity,
  type RegionalMerchantRow,
} from '../lib/api'

type EditForm = {
  merchantName: string
  accountStatus: string
  membershipPlan: MembershipPlan
  opsGiftDays: number
  registerCity: string
  licenseAddress: string
  password: string
}

type CreateForm = {
  loginName: string
  password: string
  merchantName: string
  edition: 'merchant' | 'partner'
  licenseAddress: string
  officialDays: number
  membershipPlan: MembershipPlan
}

const emptyCreate = (): CreateForm => ({
  loginName: '',
  password: '',
  merchantName: '',
  edition: 'merchant',
  licenseAddress: '',
  officialDays: 0,
  membershipPlan: 'free',
})

function planLabel(m: RegionalMerchantRow): string {
  return (
    m.membershipPlanLabel ||
    MEMBERSHIP_PLAN_OPTIONS.find((o) => o.value === m.membershipPlan)?.label ||
    String(m.membershipPlan || '免费版')
  )
}

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
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<EditForm>({
    merchantName: '',
    accountStatus: 'normal',
    membershipPlan: 'free',
    opsGiftDays: 0,
    registerCity: '',
    licenseAddress: '',
    password: '',
  })
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate)
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
    setCreateOpen(false)
    setFormErr(null)
    const plan =
      m.membershipPlan === 'member' || m.membershipPlan === 'member_plus'
        ? m.membershipPlan
        : 'free'
    setForm({
      merchantName: m.name,
      accountStatus: m.accountStatus || 'normal',
      membershipPlan: plan,
      opsGiftDays: m.opsGiftDays || 0,
      registerCity: m.city || m.registerCity || cities[0]?.city || '',
      licenseAddress: m.businessLicenseAddress || '',
      password: '',
    })
  }

  const openCreate = () => {
    setEdit(null)
    setCreateOpen(true)
    setFormErr(null)
    setCreateForm(emptyCreate())
  }

  const saveEdit = async () => {
    if (!edit) return
    if (edit.inScope === false && form.licenseAddress.trim().length < 4) {
      setFormErr('认领须填写营业执照住所/经营场所地址，用于校验是否在代理城市内')
      return
    }
    setBusy(true)
    setFormErr(null)
    try {
      const r = await mutateMerchant({
        action: edit.inScope === false ? 'claim' : 'update',
        tenantId: edit.id,
        merchantName: form.merchantName,
        accountStatus: form.accountStatus,
        membershipPlan: form.membershipPlan,
        opsGiftDays: Number(form.opsGiftDays) || 0,
        ...(form.licenseAddress.trim()
          ? { licenseAddress: form.licenseAddress.trim() }
          : { registerCity: form.registerCity }),
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

  const saveCreate = async () => {
    if (createForm.loginName.trim().length < 2) {
      setFormErr('账户名至少 2 个字符（与运营台一致）')
      return
    }
    setBusy(true)
    setFormErr(null)
    try {
      const r = await mutateMerchant({
        action: 'create',
        loginName: createForm.loginName.trim(),
        password: createForm.password,
        merchantName: createForm.merchantName.trim(),
        edition: createForm.edition,
        licenseAddress: createForm.licenseAddress.trim(),
        trialDays: 0,
        officialDays: Number(createForm.officialDays) || 0,
        membershipPlan: createForm.membershipPlan,
      })
      if (!r.ok) {
        setFormErr(r.error)
        return
      }
      setCreateOpen(false)
      setCreateForm(emptyCreate())
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">名下商家</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            开户与运营台同源；套餐可改。须以营业执照住所城市命中代理范围。城市：
            {cities.map((c) => c.city).join('、') || '未配置'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
        >
          新增客户
        </button>
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
          搜索结果：不在本城的账号可填写营业执照住所后认领（住所城市须命中代理范围）。
        </p>
      ) : null}
      {err ? <p className="text-sm text-rose-400">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">账号</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">城市</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">服务到期</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                  {searchMode
                    ? '未找到匹配账号'
                    : '本城暂无商家 ERP / FWS 账号，可点「新增客户」或上方搜索认领'}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-white">{m.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.editionLabel}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{planLabel(m)}</td>
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">新增客户</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              与运营台「手动创建账户」同源；另须执照住所城市命中代理范围
            </p>
            {formErr ? <p className="mt-2 text-xs text-rose-400">{formErr}</p> : null}
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-[var(--muted)]">
                公司/商家名称
                <input
                  value={createForm.merchantName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, merchantName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                营业执照住所/经营场所（整段地址）
                <textarea
                  value={createForm.licenseAddress}
                  onChange={(e) => setCreateForm((f) => ({ ...f, licenseAddress: e.target.value }))}
                  rows={2}
                  placeholder="例：浙江省宁波市鄞州区××路××号"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                账号类型
                <select
                  value={createForm.edition}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      edition: e.target.value === 'partner' ? 'partner' : 'merchant',
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                >
                  <option value="merchant">商家 ERP</option>
                  <option value="partner">FWS 服务商</option>
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                套餐方案（与运营台会员档位一致）
                <select
                  value={createForm.membershipPlan}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      membershipPlan: e.target.value as MembershipPlan,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                >
                  {MEMBERSHIP_PLAN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                登录名（至少 2 个字符，与运营台一致）
                <input
                  value={createForm.loginName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, loginName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                初始登录密码（至少 6 位）
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--muted)]">
                正式版权益天数（与运营台「正式版权益天数」同源，默认 0）
                <input
                  type="number"
                  min={0}
                  max={36500}
                  value={createForm.officialDays}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, officialDays: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !createForm.merchantName.trim() ||
                  !createForm.licenseAddress.trim() ||
                  createForm.loginName.trim().length < 2 ||
                  createForm.password.length < 6
                }
                onClick={() => void saveCreate()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? '创建中…' : '创建账号'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl">
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
                套餐方案
                <select
                  value={form.membershipPlan}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      membershipPlan: e.target.value as MembershipPlan,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                >
                  {MEMBERSHIP_PLAN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-[var(--muted)]">
                订购天数 {edit.subscriptionDays ?? 0} · 赠送天数可改（与运营台编辑同源）
              </p>
              <label className="text-xs text-[var(--muted)]">
                营业执照住所/经营场所
                <textarea
                  value={form.licenseAddress}
                  onChange={(e) => setForm((f) => ({ ...f, licenseAddress: e.target.value }))}
                  rows={2}
                  placeholder="填写后自动校验城市是否命中代理范围"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
                />
              </label>
              {!form.licenseAddress.trim() ? (
                <label className="text-xs text-[var(--muted)]">
                  归属城市（未填执照地址时使用；须在代理范围内）
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
              ) : null}
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
                重置商家登录密码（留空不改）
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
                disabled={busy || (!form.licenseAddress.trim() && !form.registerCity)}
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
