import { BarChart3, Download, Eye, KeyRound, Link2, Pencil, Plus, Snowflake, UserX, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import type { CustomerAccountStatus, OpsCustomer } from '../mockData'
import { tenantsToCustomers } from '../mapRegistryTenant'
import { postProvisionTenant } from '../provisionTenantApi'
import { fetchRegistry, patchTenant, postManualTenant, type RegistryTenant } from '../opsRegistryApi'
import {
  fetchSupabaseTenantsForOps,
  patchSupabaseTenant,
  resetSupabaseTenantAuthPassword,
  supabaseOpsAvailableOnClient,
  supabaseRowsToRegistryTenants,
} from '../supabaseTenantsApi'
import {
  bindTenantTokenmixKey,
  fetchTenantTokenmixUsage,
  type TokenmixUsageResponse,
} from '../opsTokenmixTenantsApi'

const OPS_RESET_PASSWORD = '123456'

function isSupabaseTenant(t: RegistryTenant | null | undefined): boolean {
  return t?.source === 'supabase'
}

function statusLabel(s: CustomerAccountStatus): string {
  if (s === 'normal') return '正常'
  if (s === 'disabled') return '停用'
  return '冻结'
}

function statusClass(s: CustomerAccountStatus): string {
  if (s === 'normal') return 'bg-emerald-500/15 text-emerald-400'
  if (s === 'disabled') return 'bg-slate-600 text-slate-300'
  return 'bg-amber-500/15 text-amber-400'
}

export default function OpsCustomersListPage() {
  const [tenants, setTenants] = useState<RegistryTenant[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | CustomerAccountStatus>('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'member' | 'member_plus'>('all')
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [syncHint, setSyncHint] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTenant, setEditTenant] = useState<RegistryTenant | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    loginName: '',
    password: '',
    merchantName: '',
    trialDays: '0',
    officialDays: '0',
  })
  const [editForm, setEditForm] = useState({
    merchantName: '',
    industry: '',
    accountStatus: 'normal' as CustomerAccountStatus,
    membershipPlan: 'free' as 'free' | 'member' | 'member_plus',
    trialDays: '0',
    subscriptionDays: '0',
    opsGiftDays: '0',
  })

  const [tokenmixBindCustomer, setTokenmixBindCustomer] = useState<OpsCustomer | null>(null)
  const [tokenmixKeyDraft, setTokenmixKeyDraft] = useState('')
  const [tokenmixUsageCustomer, setTokenmixUsageCustomer] = useState<OpsCustomer | null>(null)
  const [tokenmixUsageData, setTokenmixUsageData] = useState<TokenmixUsageResponse | null>(null)
  const [tokenmixRowBusy, setTokenmixRowBusy] = useState<string | null>(null)

  const [opsSyncTenantId, setOpsSyncTenantId] = useState('')
  const [opsSyncName, setOpsSyncName] = useState('')
  const [opsSyncGiftDays, setOpsSyncGiftDays] = useState('0')
  const [opsSyncBusy, setOpsSyncBusy] = useState(false)
  const [opsSyncMsg, setOpsSyncMsg] = useState<string | null>(null)

  /** 行内「开通 / 重置密码」提交中 */
  const [rowActivateBusy, setRowActivateBusy] = useState<string | null>(null)
  const [rowResetPwdBusy, setRowResetPwdBusy] = useState<string | null>(null)
  const [resetPwdModalCustomer, setResetPwdModalCustomer] = useState<OpsCustomer | null>(null)

  /** 开通 / 停用 / 冻结：弹窗二次确认（与重置密码弹窗一致） */
  const [accountActionModal, setAccountActionModal] = useState<{
    customer: OpsCustomer
    kind: 'activate' | 'disabled' | 'frozen'
  } | null>(null)

  /** 行内「停用 / 冻结」提交中，避免连点（记录具体操作以便只更新对应按钮文案） */
  const [rowStatusBusy, setRowStatusBusy] = useState<{ id: string; kind: 'disabled' | 'frozen' } | null>(null)

  const reload = useCallback(async () => {
    let regTenants: RegistryTenant[] = []
    try {
      const reg = await fetchRegistry()
      regTenants = reg.tenants
      setSyncHint(null)
    } catch {
      regTenants = []
      setSyncHint(
        import.meta.env.DEV
          ? '无法读取注册表（请重启商家管理后台 dev，并确认项目根可写 .meoo-dev-sync）'
          : '本地注册表不可用（线上客户列表以 Supabase 为准；若仍为空请检查运营台 API /api/meoo-supabase-tenants-list 与密钥配置）。',
      )
    }

    let merged: RegistryTenant[] = [...regTenants]
    const sb = await fetchSupabaseTenantsForOps()
    if (sb.ok) {
      const fromSb = supabaseRowsToRegistryTenants(sb.rows)
      const loginKey = (login: string | undefined) => String(login ?? '').trim().toLowerCase()
      const loginSet = new Set(fromSb.map((x) => loginKey(x.loginName)))
      merged = [
        ...fromSb,
        ...regTenants.filter((t) => !loginSet.has(loginKey(t.loginName))),
      ]
    } else if (sb.error !== 'not_configured') {
      const sbMsg = sb.hint ?? sb.detail ?? `Supabase 列表失败：${sb.error}`
      // 勿用 prev ??：线上注册表失败时已写入 hint，会盖住 tenants API 真实报错（不便排查密钥/迁移）。
      setSyncHint((prev) => (prev ? `${prev} | ${sbMsg}` : sbMsg))
    }
    setTenants(merged)
  }, [])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 4000)
    return () => window.clearInterval(t)
  }, [reload])

  useEffect(() => {
    if (tenants.length === 0) {
      setOpsSyncTenantId('')
      return
    }
    setOpsSyncTenantId((prev) => (prev && tenants.some((x) => x.id === prev) ? prev : tenants[0]!.id))
  }, [tenants])

  useEffect(() => {
    const t = tenants.find((x) => x.id === opsSyncTenantId)
    if (!t) return
    setOpsSyncName(t.merchantName)
    setOpsSyncGiftDays(String(t.opsGiftDays ?? 0))
  }, [opsSyncTenantId, tenants])

  const merged = useMemo(() => tenantsToCustomers(tenants), [tenants])

  const tenantById = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants])

  const rows = useMemo(() => {
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000
    return merged.filter((c) => {
      if (statusFilter !== 'all' && c.accountStatus !== statusFilter) return false
      const t = tenantById.get(c.id)
      if (planFilter !== 'all') {
        const plan = t?.membershipPlan ?? 'free'
        if (plan !== planFilter) return false
      }
      if (expiringSoonOnly) {
        const exp = t?.serviceExpireAt
        if (!exp) return false
        const remain = new Date(exp).getTime() - Date.now()
        if (remain > fiveDaysMs) return false
      }
      if (!keyword.trim()) return true
      const q = keyword.trim().toLowerCase()
      return (
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.industry.toLowerCase().includes(q)
      )
    })
  }, [merged, statusFilter, planFilter, expiringSoonOnly, keyword, tenantById])

  const exportDemo = () => {
    window.alert('演示环境：导出将连接管理端导出任务（Excel），由生产网关实现。')
  }

  const openStatusChangeModal = (c: OpsCustomer, next: 'disabled' | 'frozen') => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t) return
    if (next === 'disabled' && t.accountStatus === 'disabled') {
      window.alert(`「${c.companyName}」已是停用状态。`)
      return
    }
    if (next === 'frozen' && t.accountStatus === 'frozen') {
      window.alert(`「${c.companyName}」已是冻结状态。`)
      return
    }
    setAccountActionModal({ customer: c, kind: next })
  }

  const openActivateModal = (c: OpsCustomer) => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t) return
    if (t.accountStatus === 'normal') {
      window.alert(`「${c.companyName}」已是「正常」状态。`)
      return
    }
    setAccountActionModal({ customer: c, kind: 'activate' })
  }

  const confirmAccountActionModal = async () => {
    if (!accountActionModal) return
    const { customer: c, kind } = accountActionModal
    const t = tenants.find((x) => x.id === c.id)
    if (!t) {
      setAccountActionModal(null)
      return
    }

    if (kind === 'activate') {
      setRowActivateBusy(c.id)
      try {
        const r = isSupabaseTenant(t)
          ? await patchSupabaseTenant({ id: t.id, accountStatus: 'normal' })
          : await patchTenant({ id: t.id, accountStatus: 'normal' })
        if (!r.ok) {
          window.alert([r.error, r.detail].filter(Boolean).join(' — ') || '更新账号状态失败')
          return
        }
        await reload()
        window.alert(`「${c.companyName}」已设为「正常」，登录密码未改动。`)
      } finally {
        setRowActivateBusy(null)
        setAccountActionModal(null)
      }
      return
    }

    const label = kind === 'disabled' ? '停用' : '冻结'
    setRowStatusBusy({ id: c.id, kind })
    try {
      const r = isSupabaseTenant(t)
        ? await patchSupabaseTenant({ id: t.id, accountStatus: kind })
        : await patchTenant({ id: t.id, accountStatus: kind })
      if (!r.ok) {
        window.alert([r.error, r.detail].filter(Boolean).join(' — ') || '更新账号状态失败')
        return
      }
      await reload()
      window.alert(`「${c.companyName}」已设为「${label}」。`)
    } finally {
      setRowStatusBusy(null)
      setAccountActionModal(null)
    }
  }

  const performResetPassword = async (c: OpsCustomer) => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t) return
    setResetPwdModalCustomer(null)
    setRowResetPwdBusy(c.id)
    try {
      if (isSupabaseTenant(t)) {
        if (!supabaseOpsAvailableOnClient()) {
          window.alert('当前环境未启用 Supabase 运营接口，无法重置云端密码。')
          return
        }
        const r = await resetSupabaseTenantAuthPassword(t.id, OPS_RESET_PASSWORD)
        if (!r.ok) {
          window.alert(r.detail ? `${r.error ?? '重置失败'}：${r.detail}` : (r.error ?? '重置密码失败'))
          return
        }
      } else {
        const r = await patchTenant({ id: t.id, password: OPS_RESET_PASSWORD })
        if (!r.ok) {
          window.alert(r.error ?? '重置密码失败')
          return
        }
      }
      await reload()
      window.alert(`「${c.companyName}」登录密码已设为「${OPS_RESET_PASSWORD}」。`)
    } finally {
      setRowResetPwdBusy(null)
    }
  }

  const openEdit = (c: OpsCustomer) => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t) return
    setEditTenant(t)
    setEditForm({
      merchantName: t.merchantName,
      industry: t.industry,
      accountStatus: t.accountStatus,
      membershipPlan: t.membershipPlan ?? 'member',
      trialDays: String(t.trialDays),
      subscriptionDays: String(t.subscriptionDays ?? t.officialDays ?? 0),
      opsGiftDays: String(t.opsGiftDays ?? 0),
    })
    setFormErr(null)
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editTenant) return
    setFormErr(null)
    setSubmitting(true)
    try {
      const r = isSupabaseTenant(editTenant)
        ? await patchSupabaseTenant({
            id: editTenant.id,
            merchantName: editForm.merchantName.trim(),
            accountStatus: editForm.accountStatus,
            membershipPlan: editForm.membershipPlan,
            trialDays: Math.max(0, Number(editForm.trialDays) || 0),
            opsGiftDays: Math.max(0, Number(editForm.opsGiftDays) || 0),
          })
        : await patchTenant({
            id: editTenant.id,
            merchantName: editForm.merchantName.trim(),
            industry: editForm.industry.trim(),
            accountStatus: editForm.accountStatus,
            trialDays: Math.max(0, Number(editForm.trialDays) || 0),
            officialDays:
              Math.max(0, Number(editForm.subscriptionDays) || 0) +
              Math.max(0, Number(editForm.opsGiftDays) || 0),
          })
      if (!r.ok) {
        setFormErr(r.error ?? '保存失败')
        return
      }
      setEditOpen(false)
      setEditTenant(null)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  const saveOpsSyncFields = async () => {
    if (!opsSyncTenantId) return
    setOpsSyncBusy(true)
    setOpsSyncMsg(null)
    try {
      const sel = tenants.find((x) => x.id === opsSyncTenantId)
      const r = isSupabaseTenant(sel)
        ? await patchSupabaseTenant({
            id: opsSyncTenantId,
            merchantName: opsSyncName.trim(),
            opsGiftDays: Math.max(0, Math.floor(Number(opsSyncGiftDays) || 0)),
          })
        : await patchTenant({
            id: opsSyncTenantId,
            merchantName: opsSyncName.trim(),
            officialDays: Math.max(0, Math.floor(Number(opsSyncGiftDays) || 0)),
          })
      setOpsSyncMsg(
        r.ok
          ? isSupabaseTenant(sel)
            ? '已更新 Supabase 租户。'
            : '已写入注册表，ERP 心跳将同步。'
          : r.error ?? '保存失败',
      )
      await reload()
    } finally {
      setOpsSyncBusy(false)
    }
  }

  const openTokenmixBind = (c: OpsCustomer) => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t || !isSupabaseTenant(t)) {
      window.alert('仅 Supabase 云端租户可绑定 TokenMix 密钥。')
      return
    }
    setTokenmixKeyDraft('')
    setTokenmixBindCustomer(c)
  }

  const submitTokenmixBind = async () => {
    if (!tokenmixBindCustomer) return
    const key = tokenmixKeyDraft.trim()
    if (key.length < 8) {
      window.alert('请输入有效的 TokenMix API Key')
      return
    }
    setTokenmixRowBusy(tokenmixBindCustomer.id)
    try {
      const r = await bindTenantTokenmixKey(tokenmixBindCustomer.id, key)
      if (!r.ok) {
        window.alert([r.error, r.detail].filter(Boolean).join(' — ') || '绑定失败')
        return
      }
      setTokenmixBindCustomer(null)
      await reload()
      window.alert(`「${tokenmixBindCustomer.companyName}」TokenMix 已绑定。`)
    } finally {
      setTokenmixRowBusy(null)
    }
  }

  const openTokenmixUsage = async (c: OpsCustomer) => {
    const t = tenants.find((x) => x.id === c.id)
    if (!t || !isSupabaseTenant(t)) {
      window.alert('仅 Supabase 云端租户可查看用量。')
      return
    }
    setTokenmixUsageCustomer(c)
    setTokenmixUsageData(null)
    setTokenmixRowBusy(c.id)
    try {
      const r = await fetchTenantTokenmixUsage(c.id)
      setTokenmixUsageData(r)
    } finally {
      setTokenmixRowBusy(null)
    }
  }

  const submitManual = async () => {
    setFormErr(null)
    const loginName = form.loginName.trim()
    const password = form.password
    const merchantName = form.merchantName.trim()
    const trialDays = Math.max(0, Number(form.trialDays) || 0)
    const officialDays = Math.max(0, Number(form.officialDays) || 0)
    if (loginName.length < 2) {
      setFormErr('账户名至少 2 个字符')
      return
    }
    if (password.length < 6) {
      setFormErr('密码至少 6 位')
      return
    }
    if (!merchantName) {
      setFormErr('请填写商家名')
      return
    }
    setSubmitting(true)
    try {
      if (import.meta.env.PROD || import.meta.env.VITE_SUPABASE_URL) {
        const pr = await postProvisionTenant({ loginName, password, merchantName, trialDays, officialDays })
        if (!pr.ok) {
          if (pr.error === 'login_exists') {
            if (!import.meta.env.DEV) {
              setFormErr('该登录名在 Supabase 中已存在，请在列表中查找或更换账户名。')
              await reload()
              return
            }
            let reg: Awaited<ReturnType<typeof fetchRegistry>>
            try {
              reg = await fetchRegistry()
            } catch {
              setFormErr('无法读取注册表，请确认本机 dev 已启动并可写项目根 .meoo-dev-sync')
              return
            }
            const existsLocal = reg.tenants.some(
              (t) => t.loginName.trim().toLowerCase() === loginName.toLowerCase(),
            )
            if (existsLocal) {
              setFormErr('本地客户列表中已有该账户名。')
              await reload()
              return
            }
            const rOnly = await postManualTenant({ loginName, password, merchantName, trialDays, officialDays })
            if (!rOnly.ok) {
              setFormErr(rOnly.error === 'login_exists' ? '该账户名已存在' : rOnly.error ?? '写入本地失败')
              return
            }
            setCreateOpen(false)
            setForm({ loginName: '', password: '', merchantName: '', trialDays: '0', officialDays: '0' })
            await reload()
            window.alert(
              `Supabase 中已有登录名「${loginName}」，已在本地注册表补写客户记录。\n` +
                '列表中应显示该商户；ERP 使用本次填写的密码摘要登录。若与云端密码不一致，请在 Supabase 控制台对齐。',
            )
            return
          }
          setFormErr(
            pr.missingEnv?.length
              ? `${pr.error ?? 'provision_not_configured'}：${pr.missingEnv.join('；')}`
              : pr.hint
                ? `${pr.error ?? 'Supabase 开通失败'}（${pr.hint}）`
                : pr.detail
                  ? `${pr.error ?? '开通失败'}：${pr.detail}`
                  : pr.error ?? 'Supabase 开通失败',
          )
          return
        }
        // 云端已开通：生产环境无 /api/ops-sync 注册表接口，勿再 postManualTenant
        if (import.meta.env.DEV) {
          const rSync = await postManualTenant({ loginName, password, merchantName, trialDays, officialDays })
          if (!rSync.ok) {
            setFormErr(
              rSync.error === 'login_exists'
                ? '该账户名已存在'
                : rSync.error ?? '云端已开通，但写入本地注册表失败',
            )
            return
          }
        }
        setCreateOpen(false)
        setForm({ loginName: '', password: '', merchantName: '', trialDays: '0', officialDays: '0' })
        await reload()
        return
      }
      const r = await postManualTenant({ loginName, password, merchantName, trialDays, officialDays })
      if (!r.ok) {
        setFormErr(r.error === 'login_exists' ? '该账户名已存在' : r.error ?? '创建失败')
        return
      }
      setCreateOpen(false)
      setForm({ loginName: '', password: '', merchantName: '', trialDays: '0', officialDays: '0' })
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">客户管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          已配置 Supabase 时，列表<strong className="text-slate-400">优先展示云端租户</strong>
          （Auth + public.tenants），并与注册表去重合并；未配置时仅显示项目根注册表。手动创建走云端开通；本机 dev 另写入注册表便于 ERP
          同步，线上无注册表接口时不写入。
        </p>
        {syncHint ? <p className="mt-2 text-xs text-amber-400/90">{syncHint}</p> : null}
      </div>

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/40 p-4">
        <p className="text-sm font-medium text-indigo-200">运营管控台同步（本机 dev）</p>
        <p className="mt-1 text-xs text-indigo-300/90">
          选中「Supabase」客户时保存会更新云端租户表；选中注册表客户时写入注册表。ERP「订阅与试用」内已隐藏本区块。
        </p>
        {tenants.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">暂无租户，请先创建客户或等待 ERP 推送。</p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">目标客户</label>
              <select
                value={opsSyncTenantId}
                onChange={(e) => setOpsSyncTenantId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.merchantName} · {t.loginName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">商家 / 企业显示名</label>
              <input
                value={opsSyncName}
                onChange={(e) => setOpsSyncName(e.target.value)}
                placeholder="如：蜀味火锅（春熙店）"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">运营赠送权益（天）</label>
              <input
                type="number"
                min={0}
                value={opsSyncGiftDays}
                onChange={(e) => setOpsSyncGiftDays(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
          </div>
        )}
        {tenants.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={opsSyncBusy}
              onClick={() => void saveOpsSyncFields()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {opsSyncBusy ? '保存中…' : '保存到注册表'}
            </button>
            {opsSyncMsg ? <span className="text-xs text-emerald-400/90">{opsSyncMsg}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">账号状态</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">全部</option>
            <option value="normal">正常</option>
            <option value="disabled">停用</option>
            <option value="frozen">冻结</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">会员版本</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">全部</option>
            <option value="free">免费版</option>
            <option value="member">会员版</option>
            <option value="member_plus">会员 Plus</option>
          </select>
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={expiringSoonOnly}
              onChange={(e) => setExpiringSoonOnly(e.target.checked)}
              className="rounded border-slate-600"
            />
            订阅剩余 &lt; 5 天
          </label>
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">搜索</label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="企业 / 联系人 / 手机 / 行业"
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setFormErr(null)
            setCreateOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          手动创建账户
        </button>
        <button
          type="button"
          onClick={exportDemo}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
        >
          <Download className="h-4 w-4" />
          导出 Excel
        </button>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !submitting && setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">手动创建账户</h2>
              <button
                type="button"
                disabled={submitting}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="关闭"
                onClick={() => setCreateOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-slate-400">账户名（登录名）</label>
                <input
                  value={form.loginName}
                  onChange={(e) => setForm((f) => ({ ...f, loginName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">密码</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">商家名</label>
                <input
                  value={form.merchantName}
                  onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">正式版权益（天，可选）</label>
                <input
                  type="number"
                  min={0}
                  value={form.officialDays}
                  onChange={(e) => setForm((f) => ({ ...f, officialDays: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              {formErr ? <p className="text-xs text-red-400">{formErr}</p> : null}
              <p className="text-[11px] text-slate-500">新账号默认免费版、无试用；会员档位请在创建后于「编辑」中设置。</p>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitManual()}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? '提交中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editTenant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !submitting && setEditOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">编辑客户</h2>
              <button
                type="button"
                disabled={submitting}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="关闭"
                onClick={() => setEditOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 font-mono text-[11px] text-slate-500">ID {editTenant.id}</p>
            <p className="mb-3 text-xs text-slate-500">登录名：{editTenant.loginName}（只读）</p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs text-slate-400">会员档位</label>
                <select
                  value={editForm.membershipPlan}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      membershipPlan: e.target.value as 'free' | 'member' | 'member_plus',
                    }))
                  }
                  disabled={!isSupabaseTenant(editTenant)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 disabled:opacity-50"
                >
                  <option value="free">免费版</option>
                  <option value="member">会员版（¥168/月）</option>
                  <option value="member_plus">会员 Plus（¥598/月）</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">商家名</label>
                <input
                  value={editForm.merchantName}
                  onChange={(e) => setEditForm((f) => ({ ...f, merchantName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">行业</label>
                <input
                  value={editForm.industry}
                  onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">账号状态</label>
                <select
                  value={editForm.accountStatus}
                  onChange={(e) => setEditForm((f) => ({ ...f, accountStatus: e.target.value as CustomerAccountStatus }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
                >
                  <option value="normal">正常</option>
                  <option value="disabled">停用</option>
                  <option value="frozen">冻结</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">订阅权益（天，只读）</label>
                <input
                  type="number"
                  readOnly
                  value={editForm.subscriptionDays}
                  className="w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-slate-400"
                />
                <p className="mt-1 text-[10px] text-slate-500">购买会员/Plus 并由订单确认后自动累加（月付 +30 天）。</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">运营赠送权益（天）</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.opsGiftDays}
                  onChange={(e) => setEditForm((f) => ({ ...f, opsGiftDays: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">总权益（天）</label>
                <input
                  type="number"
                  readOnly
                  value={
                    Math.max(0, Number(editForm.subscriptionDays) || 0) +
                    Math.max(0, Number(editForm.opsGiftDays) || 0)
                  }
                  className="w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-slate-300"
                />
                <p className="mt-1 text-[10px] text-slate-500">总权益 = 订阅权益 + 运营赠送；商家端剩余时间以截止日为准。</p>
              </div>
              {formErr ? <p className="text-xs text-red-400">{formErr}</p> : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitEdit()}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tokenmixBindCustomer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => tokenmixRowBusy !== tokenmixBindCustomer.id && setTokenmixBindCustomer(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-white">Tokenmix 绑定</h2>
            <p className="mb-3 text-xs text-slate-500">{tokenmixBindCustomer.companyName}</p>
            <label className="mb-1 block text-xs text-slate-400">API 密钥</label>
            <input
              type="password"
              autoComplete="off"
              value={tokenmixKeyDraft}
              onChange={(e) => setTokenmixKeyDraft(e.target.value)}
              placeholder="sk-..."
              className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={tokenmixRowBusy === tokenmixBindCustomer.id}
                onClick={() => setTokenmixBindCustomer(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              >
                取消
              </button>
              <button
                type="button"
                disabled={tokenmixRowBusy === tokenmixBindCustomer.id}
                onClick={() => void submitTokenmixBind()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {tokenmixRowBusy === tokenmixBindCustomer.id ? '保存中…' : '保存绑定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tokenmixUsageCustomer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setTokenmixUsageCustomer(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-white">用量明细</h2>
            <p className="mb-4 text-xs text-slate-500">{tokenmixUsageCustomer.companyName}</p>
            {!tokenmixUsageData ? (
              <p className="text-sm text-slate-400">加载中…</p>
            ) : !tokenmixUsageData.ok ? (
              <p className="text-sm text-red-400">
                {[tokenmixUsageData.error, tokenmixUsageData.detail].filter(Boolean).join(' — ')}
              </p>
            ) : (
              <div className="space-y-3 text-sm text-slate-300">
                <p>会员档位：{tokenmixUsageData.membershipPlan ?? '—'}</p>
                <p>TokenMix：{tokenmixUsageData.tokenmixBound ? '已绑定' : '未绑定'}</p>
                <p>
                  直连 AI 本月：{tokenmixUsageData.directAiCallsUsed ?? 0} 次
                  {tokenmixUsageData.directAiUsageMonth
                    ? `（${tokenmixUsageData.directAiUsageMonth}）`
                    : ''}
                </p>
                {tokenmixUsageData.tokenmixUsage ? (
                  <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-400">
                    {JSON.stringify(tokenmixUsageData.tokenmixUsage, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-500">未绑定 TokenMix 或暂无同步快照。</p>
                )}
              </div>
            )}
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-slate-600 py-2 text-sm text-slate-300"
              onClick={() => setTokenmixUsageCustomer(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {resetPwdModalCustomer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pwd-title"
          onClick={() => rowResetPwdBusy !== resetPwdModalCustomer.id && setResetPwdModalCustomer(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="reset-pwd-title" className="text-lg font-semibold text-white">
                重置登录密码
              </h2>
              <button
                type="button"
                disabled={rowResetPwdBusy === resetPwdModalCustomer.id}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                aria-label="关闭"
                onClick={() => setResetPwdModalCustomer(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              确认将「<span className="font-medium text-white">{resetPwdModalCustomer.companyName}</span>
              」的登录密码重置为「
              <span className="font-mono text-amber-200/95">{OPS_RESET_PASSWORD}</span>
              」？
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {(() => {
                const rt = tenants.find((x) => x.id === resetPwdModalCustomer.id)
                return isSupabaseTenant(rt)
                  ? '将更新 Supabase Auth 中该租户 owner 主账号的密码，用于 ERP 商家登录。'
                  : '将更新项目根注册表中的 passwordHash（与手动创建账户摘要算法一致）。'
              })()}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={rowResetPwdBusy === resetPwdModalCustomer.id}
                onClick={() => setResetPwdModalCustomer(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={rowResetPwdBusy === resetPwdModalCustomer.id}
                onClick={() => void performResetPassword(resetPwdModalCustomer)}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {rowResetPwdBusy === resetPwdModalCustomer.id ? '处理中…' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountActionModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-action-title"
          onClick={() =>
            rowActivateBusy !== accountActionModal.customer.id &&
            rowStatusBusy?.id !== accountActionModal.customer.id &&
            setAccountActionModal(null)
          }
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="account-action-title" className="text-lg font-semibold text-white">
                {accountActionModal.kind === 'activate'
                  ? '确认开通（启用）'
                  : accountActionModal.kind === 'disabled'
                    ? '确认停用'
                    : '确认冻结'}
              </h2>
              <button
                type="button"
                disabled={
                  rowActivateBusy === accountActionModal.customer.id ||
                  rowStatusBusy?.id === accountActionModal.customer.id
                }
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                aria-label="关闭"
                onClick={() => setAccountActionModal(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              {(() => {
                const rt = tenants.find((x) => x.id === accountActionModal.customer.id)
                const dest = isSupabaseTenant(rt) ? 'Supabase 租户表' : '项目根注册表'
                const name = accountActionModal.customer.companyName
                if (accountActionModal.kind === 'activate') {
                  return (
                    <>
                      确定将「<span className="font-medium text-white">{name}</span>」设为「正常」（启用）？
                      <span className="mt-2 block text-slate-400">
                        不修改登录密码，仅更新账号状态并写入{dest}。
                      </span>
                    </>
                  )
                }
                const lab = accountActionModal.kind === 'disabled' ? '停用' : '冻结'
                return (
                  <>
                    确定将「<span className="font-medium text-white">{name}</span>」设为「{lab}」？
                    <span className="mt-2 block text-slate-400">将写入{dest}。</span>
                  </>
                )
              })()}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={
                  rowActivateBusy === accountActionModal.customer.id ||
                  rowStatusBusy?.id === accountActionModal.customer.id
                }
                onClick={() => setAccountActionModal(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  rowActivateBusy === accountActionModal.customer.id ||
                  rowStatusBusy?.id === accountActionModal.customer.id
                }
                onClick={() => void confirmAccountActionModal()}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
                  accountActionModal.kind === 'activate'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : accountActionModal.kind === 'disabled'
                      ? 'bg-slate-600 hover:bg-slate-500'
                      : 'bg-amber-600 hover:bg-amber-500',
                )}
              >
                {rowActivateBusy === accountActionModal.customer.id ||
                rowStatusBusy?.id === accountActionModal.customer.id
                  ? '处理中…'
                  : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">企业 / 联系人</th>
                <th className="px-3 py-3">手机</th>
                <th className="px-3 py-3">行业</th>
                <th className="px-3 py-3">注册时间</th>
                <th className="px-3 py-3">账号状态</th>
                <th className="px-3 py-3">套餐 / 到期</th>
                <th className="px-3 py-3">付费</th>
                <th className="px-3 py-3">活跃 D/W/M</th>
                <th className="px-3 py-3">门店 / 达人</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{c.companyName}</div>
                    <div className="text-xs text-slate-500">{c.contactName}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-300">{c.phone}</td>
                  <td className="px-3 py-2.5 text-slate-400">{c.industry}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{c.registeredAt}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusClass(c.accountStatus))}>
                      {statusLabel(c.accountStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    <div>{c.planName}</div>
                    <div className="text-xs text-slate-500">{c.planExpireAt}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {c.payStatus === 'paid' ? '已付费' : c.payStatus === 'overdue' ? '欠费' : '待付'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400">
                    {c.dau}/{c.wau}/{c.mau}
                    <div className="text-[10px] text-slate-600">活跃 {c.activeDays} 天</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    门店 {c.storeCount}
                    <div className="text-slate-600">{c.storeStatusSummary}</div>
                    <div>
                      达人 {c.talentRecruitCount} / 单 {c.talentOrderCount}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        <Pencil className="h-3 w-3" />
                        编辑
                      </button>
                      <Link
                        to={`/customers/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2 py-1 text-xs text-white hover:bg-indigo-500"
                      >
                        <Eye className="h-3 w-3" />
                        详情
                      </Link>
                      {isSupabaseTenant(tenants.find((x) => x.id === c.id)) ? (
                        <>
                          <button
                            type="button"
                            disabled={tokenmixRowBusy === c.id}
                            onClick={() => openTokenmixBind(c)}
                            className="inline-flex items-center gap-0.5 rounded-md border border-cyan-800/50 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-950/30 disabled:opacity-50"
                          >
                            <Link2 className="h-3 w-3" />
                            Tokenmix
                          </button>
                          <button
                            type="button"
                            disabled={tokenmixRowBusy === c.id}
                            onClick={() => void openTokenmixUsage(c)}
                            className="inline-flex items-center gap-0.5 rounded-md border border-violet-800/50 px-2 py-1 text-xs text-violet-300 hover:bg-violet-950/30 disabled:opacity-50"
                          >
                            <BarChart3 className="h-3 w-3" />
                            用量
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          rowActivateBusy === c.id ||
                          rowResetPwdBusy === c.id ||
                          rowStatusBusy?.id === c.id ||
                          accountActionModal?.customer.id === c.id
                        }
                        onClick={() => openActivateModal(c)}
                        className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {rowActivateBusy === c.id ? '处理中…' : '开通'}
                      </button>
                      <button
                        type="button"
                        disabled={
                          rowActivateBusy === c.id ||
                          rowResetPwdBusy === c.id ||
                          rowStatusBusy?.id === c.id
                        }
                        onClick={() => setResetPwdModalCustomer(c)}
                        className="inline-flex items-center gap-0.5 rounded-md border border-amber-800/40 px-2 py-1 text-xs text-amber-300/95 hover:bg-amber-950/25 disabled:opacity-50"
                      >
                        <KeyRound className="h-3 w-3" />
                        {rowResetPwdBusy === c.id ? '处理中…' : '重置密码'}
                      </button>
                      <button
                        type="button"
                        disabled={
                          rowStatusBusy?.id === c.id ||
                          rowActivateBusy === c.id ||
                          rowResetPwdBusy === c.id ||
                          accountActionModal?.customer.id === c.id
                        }
                        onClick={() => openStatusChangeModal(c, 'disabled')}
                        className="inline-flex items-center gap-0.5 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" />
                        {rowStatusBusy?.id === c.id && rowStatusBusy.kind === 'disabled' ? '处理中…' : '停用'}
                      </button>
                      <button
                        type="button"
                        disabled={
                          rowStatusBusy?.id === c.id ||
                          rowActivateBusy === c.id ||
                          rowResetPwdBusy === c.id ||
                          accountActionModal?.customer.id === c.id
                        }
                        onClick={() => openStatusChangeModal(c, 'frozen')}
                        className="inline-flex items-center gap-0.5 rounded-md border border-amber-900/50 px-2 py-1 text-xs text-amber-400/90 hover:bg-amber-950/30 disabled:opacity-50"
                      >
                        <Snowflake className="h-3 w-3" />
                        {rowStatusBusy?.id === c.id && rowStatusBusy.kind === 'frozen' ? '处理中…' : '冻结'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            暂无客户数据。可仅在本页「手动创建账户」，或启动 Web ERP 后由子账号与设置页推送同步。
          </div>
        ) : null}
      </div>
    </div>
  )
}
