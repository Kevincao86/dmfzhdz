import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { fetchSession, registerPrUser, setLoginCredentials } from '../lib/mpApi'
import { getAccount, getActiveRole, getToken, setSession } from '../lib/mpSession'
import { emptyPrProfile, readPrProfile, writePrProfile, type PrProfile } from '../lib/mpSync/userProfile'
import { readWxAccount } from '../lib/mpSync/wxAccount'
import { validateRegion } from '../lib/mpSync/regionPicker'

const ACCOUNT_TYPES = [
  { id: 'company' as const, label: '公司（机构）' },
  { id: 'personal' as const, label: '个人' },
]

export default function PrProfilePage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/profile" replace />

  const acc = getAccount()
  const wx = readWxAccount()
  const prev = readPrProfile()
  const [form, setForm] = useState<PrProfile>(() => ({
    ...emptyPrProfile(),
    ...prev,
    wxNickName: prev?.wxNickName || wx?.wxNickName || acc?.wxNickName || '',
    lingqiPrId: prev?.lingqiPrId || acc?.lingqiPrId || '',
    id: prev?.id || acc?.registryPrId || '',
  }))
  const [loginName, setLoginName] = useState(acc?.loginName || '')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(!!acc?.hasPassword)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!getToken()) return
    void fetchSession()
      .then(({ account }) => {
        setSession(getToken(), account)
        setLoginName(account.loginName || '')
        setHasPassword(!!account.hasPassword)
        if (account.lingqiPrId) {
          setForm((f) => ({
            ...f,
            lingqiPrId: account.lingqiPrId || f.lingqiPrId,
            id: account.registryPrId || f.id,
          }))
        }
      })
      .catch(() => {})
  }, [])

  function setField<K extends keyof PrProfile>(k: K, v: PrProfile[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function onSave() {
    const org =
      form.accountType === 'personal'
        ? String(form.personalName || '').trim()
        : String(form.companyName || '').trim()
    if (!org) {
      setMsg(form.accountType === 'personal' ? '请填写个人名称' : '请填写公司/机构名称')
      return
    }
    const regionErr = validateRegion(form.province, form.city)
    if (regionErr) {
      setMsg(regionErr)
      return
    }
    setSaving(true)
    setMsg('')
    const accNow = getAccount()
    const saved: PrProfile = {
      ...form,
      id: accNow?.registryPrId || form.id || prev?.id || `MPR-${Date.now()}`,
      lingqiPrId: accNow?.lingqiPrId || form.lingqiPrId,
      companyName: form.accountType === 'company' ? org : '',
      personalName: form.accountType === 'personal' ? org : '',
      contactName: form.contactName || (form.accountType === 'personal' ? org : form.contactName),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      registeredAt: form.registeredAt || prev?.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    writePrProfile(saved)
    let credWarn = ''
    if (getToken() && loginName.trim()) {
      try {
        const { account } = await setLoginCredentials(loginName.trim(), password)
        setSession(getToken(), account)
        setHasPassword(!!account.hasPassword)
        setPassword('')
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        credWarn = m.includes('login_name_taken') ? '登录名已被占用' : `登录账号未保存：${m}`
      }
    }
    try {
      const reg = (await registerPrUser({
        id: saved.id,
        lingqiPrId: saved.lingqiPrId || '',
        accountType: saved.accountType,
        companyName: saved.companyName,
        personalName: saved.personalName,
        contactName: saved.contactName,
        contactPhone: saved.contactPhone,
        wechatId: saved.wechatId,
        province: saved.province,
        city: saved.city,
        intro: saved.intro,
        wxNickName: saved.wxNickName,
        wxAvatarUrl: saved.wxAvatarUrl,
        registeredAt: saved.registeredAt,
        updatedAt: saved.updatedAt,
      })) as { lingqiPrId?: string; id?: string }
      if (reg?.lingqiPrId) saved.lingqiPrId = reg.lingqiPrId
      if (reg?.id) saved.id = reg.id
      writePrProfile(saved)
      setForm(saved)
      setMsg(credWarn ? `${credWarn}；资料已同步云端` : '已保存并同步云端')
    } catch (e) {
      setMsg(
        credWarn
          ? `${credWarn}；资料已保存本机；云端同步失败：${e instanceof Error ? e.message : String(e)}`
          : `已保存本机；云端同步失败：${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  const orgLabel = form.accountType === 'personal' ? '个人名称' : '公司/机构名称'

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">PR 信息</h2>
      {form.lingqiPrId ? <p className="text-sm text-slate-400">PR ID：{form.lingqiPrId}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-4 space-y-3 text-sm">
        <p className="text-slate-400 text-xs">登录账号（选填）— 与小程序账号密码登录共用</p>
        <label className="block">
          <span className="text-slate-400">登录名</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">登录密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? '留空则不修改原密码' : '至少 6 位，可不填'}
          />
        </label>
      </section>

      <div className="flex gap-2">
        {ACCOUNT_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm ${form.accountType === t.id ? 'bg-violet-600' : 'bg-white/10'}`}
            onClick={() => setField('accountType', t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-slate-400">{orgLabel}</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.accountType === 'personal' ? form.personalName : form.companyName}
            onChange={(e) =>
              form.accountType === 'personal'
                ? setField('personalName', e.target.value)
                : setField('companyName', e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className="text-slate-400">联系人</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.contactName}
            onChange={(e) => setField('contactName', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">联系电话</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.contactPhone}
            onChange={(e) => setField('contactPhone', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">微信号</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.wechatId}
            onChange={(e) => setField('wechatId', e.target.value)}
          />
        </label>
        <RegionSelect
          province={form.province}
          city={form.city}
          onChange={(province, city) => setForm((f) => ({ ...f, province, city }))}
        />
        <label className="block">
          <span className="text-slate-400">简介</span>
          <textarea
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 min-h-[80px]"
            value={form.intro}
            onChange={(e) => setField('intro', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-slate-400">微信昵称（展示）</span>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
            value={form.wxNickName}
            onChange={(e) => setField('wxNickName', e.target.value)}
          />
        </label>
      </section>

      {msg ? <p className="text-sm text-amber-400">{msg}</p> : null}
      <button
        type="button"
        disabled={saving}
        className="px-6 py-2.5 rounded-lg bg-violet-600 font-medium disabled:opacity-50"
        onClick={() => void onSave()}
      >
        {saving ? '保存中…' : '保存 PR 资料'}
      </button>
    </div>
  )
}
