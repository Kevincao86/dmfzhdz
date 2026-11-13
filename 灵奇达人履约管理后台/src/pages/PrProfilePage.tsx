import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import RegionSelect from '../components/mp/RegionSelect'
import { useProtectedForm } from '../hooks/useProtectedForm'
import { fetchSession, registerPrUser, setLoginCredentials } from '../lib/mpApi'
import { pullRegistryProfileAfterLogin } from '../lib/registryProfileSync'
import { getAccount, getActiveRole, getToken, persistAccount } from '../lib/mpSession'
import { emptyPrProfile, readPrProfile, writePrProfile, type PrProfile } from '../lib/mpSync/userProfile'
import { readWxAccount } from '../lib/mpSync/wxAccount'
import { validateBasicContactFields } from '../lib/mpSync/basicContactFields'
import { setupRegionState, validateRegion } from '../lib/mpSync/regionPicker'
import { apiUrl } from '../lib/mpApiBase'
import { ProfileEnvelope } from './TalentProfilePage'

async function uploadCompanyLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('请上传 PNG、JPG 或 WebP 图片')
  }
  if (file.size > 2 * 1024 * 1024) throw new Error('Logo 请小于 2MB，建议 PNG')
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || '')
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw)
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  const res = await fetch(apiUrl('/api/meoo-ops-content-image-upload'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name || `pr-logo-${Date.now()}.png`,
      contentType: file.type || 'image/png',
      contentBase64,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; imageUrl?: string; error?: string; detail?: string }
  const imageUrl = String(data.imageUrl || '').trim()
  if (!res.ok || data.ok === false || !/^https:\/\//i.test(imageUrl)) {
    throw new Error(String(data.detail || data.error || 'Logo 上传失败'))
  }
  return imageUrl
}

const ACCOUNT_TYPES = [
  { id: 'company' as const, label: '公司（机构）' },
  { id: 'personal' as const, label: '个人' },
]

export default function PrProfilePage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/profile" replace />
  return <PrProfileForm />
}

function PrProfileForm() {
  const acc = getAccount()
  const wx = readWxAccount()
  const prev = readPrProfile()
  const [form, setForm] = useState<PrProfile>(() => ({
    ...emptyPrProfile(),
    ...prev,
    lingqiPrId: prev?.lingqiPrId || acc?.lingqiPrId || '',
    id: prev?.id || acc?.registryPrId || '',
  }))
  const [loginName, setLoginName] = useState(acc?.loginName || '')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(!!acc?.hasPassword)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [openLogin, setOpenLogin] = useState(false)
  const [loginMode, setLoginMode] = useState<'view' | 'edit'>('edit')
  const [openOrg, setOpenOrg] = useState(false)
  const [orgMode, setOrgMode] = useState<'view' | 'edit'>('edit')
  const [openContact, setOpenContact] = useState(false)
  const [contactMode, setContactMode] = useState<'view' | 'edit'>('edit')
  const { lockForm, unlockForm, fieldFocusProps, lockedRef: formLockedRef } = useProtectedForm()
  const remoteHydratedRef = useRef(false)
  const focus = fieldFocusProps()

  useEffect(() => {
    return () => {
      unlockForm()
    }
  }, [unlockForm])

  useEffect(() => {
    if (!getToken()) return
    let alive = true
    void (async () => {
      try {
        const { account } = await fetchSession()
        if (!alive) return
        persistAccount(account)
        if (!formLockedRef.current) {
          setLoginName(account.loginName || '')
          setHasPassword(!!account.hasPassword)
        }
        await pullRegistryProfileAfterLogin()
        if (!alive || formLockedRef.current || remoteHydratedRef.current) return
        remoteHydratedRef.current = true
        const pr = readPrProfile()
        if (pr) {
          setForm((f) => ({
            ...f,
            ...pr,
            lingqiPrId: account.lingqiPrId || pr.lingqiPrId || f.lingqiPrId,
            id: account.registryPrId || pr.id || f.id,
          }))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [formLockedRef])

  function setField<K extends keyof PrProfile>(k: K, v: PrProfile[K]) {
    lockForm()
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function onSave(section: 'org' | 'contact' | 'login') {
    const org =
      form.accountType === 'personal'
        ? String(form.personalName || '').trim()
        : String(form.companyName || '').trim()
    if (section === 'org' && !org) {
      setMsg(form.accountType === 'personal' ? '请填写个人名称' : '请填写公司/机构名称')
      return
    }
    if (section === 'org' && form.accountType === 'company' && !String(form.contactName || '').trim()) {
      setMsg('请填写联系人')
      return
    }
    if (section === 'contact') {
      const contactErr = validateBasicContactFields({
        contactPhone: form.contactPhone,
        wechatId: form.wechatId,
      })
      if (contactErr) {
        setMsg(contactErr)
        return
      }
      const regionCheck = setupRegionState(form.province, form.city)
      const regionErr = validateRegion(regionCheck.province, regionCheck.city)
      if (regionErr) {
        setMsg(regionErr)
        return
      }
    }
    if (section === 'login' && password && password.length < 6) {
      setMsg('密码至少 6 位')
      return
    }
    const region = setupRegionState(form.province, form.city)
    setSaving(true)
    setMsg('')
    const accNow = getAccount()
    const saved: PrProfile = {
      ...form,
      province: region.province,
      city: region.city,
      wxNickName: org || form.wxNickName,
      wxAvatarUrl: form.wxAvatarUrl || prev?.wxAvatarUrl || wx?.wxAvatarUrl || acc?.wxAvatarUrl || '',
      id: accNow?.registryPrId || form.id || prev?.id || `MPR-${Date.now()}`,
      lingqiPrId: accNow?.lingqiPrId || form.lingqiPrId,
      companyName: form.accountType === 'company' ? org : '',
      personalName: form.accountType === 'personal' ? org : '',
      companyLogoUrl: /^https:\/\//i.test(String(form.companyLogoUrl || '')) ? form.companyLogoUrl : '',
      contactName: form.contactName || (form.accountType === 'personal' ? org : form.contactName),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      registeredAt: form.registeredAt || prev?.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    writePrProfile(saved)
    let credWarn = ''
    if (section === 'login' && getToken() && loginName.trim()) {
      try {
        const { account } = await setLoginCredentials(loginName.trim(), password)
        persistAccount(account)
        setHasPassword(!!account.hasPassword)
        setPassword('')
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        credWarn = m.includes('login_name_taken') ? '该手机号已被注册' : `登录账号未保存：${m}`
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
        companyLogoUrl: saved.companyLogoUrl,
        wxNickName: saved.wxNickName,
        wxAvatarUrl: saved.wxAvatarUrl,
        registeredAt: saved.registeredAt,
        updatedAt: saved.updatedAt,
      })) as { lingqiPrId?: string; id?: string }
      if (reg?.lingqiPrId) saved.lingqiPrId = reg.lingqiPrId
      if (reg?.id) saved.id = reg.id
      writePrProfile(saved)
      await pullRegistryProfileAfterLogin()
      const latest = readPrProfile()
      if (latest) {
        saved.lingqiPrId = latest.lingqiPrId || saved.lingqiPrId
        Object.assign(saved, latest)
      }
      setForm(saved)
      unlockForm()
      remoteHydratedRef.current = false
      if (section === 'org') setOpenOrg(false)
      if (section === 'contact') setOpenContact(false)
      if (section === 'login') setOpenLogin(false)
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

  async function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoUploading(true)
    setMsg('')
    try {
      const url = await uploadCompanyLogo(file)
      setField('companyLogoUrl', url)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Logo 上传失败')
    } finally {
      setLogoUploading(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <Link to="/profile" className="text-sm text-slate-400 hover:text-white">
        ← 返回我的
      </Link>
      <h2 className="text-xl font-bold">PR 信息</h2>
      {form.lingqiPrId ? <p className="text-sm text-slate-400">PR ID：{form.lingqiPrId}</p> : null}

      <ProfileEnvelope
        title="修改密码"
        summary={hasPassword ? '账号密码已设置' : '未设置登录密码'}
        open={openLogin}
        readOnly={loginMode === 'view'}
        saving={saving}
        onView={
          hasPassword
            ? () => {
                setLoginMode('view')
                setOpenLogin(true)
              }
            : undefined
        }
        onEdit={() => {
          setLoginMode('edit')
          setOpenLogin(true)
        }}
        onClose={() => setOpenLogin(false)}
        onSave={() => void onSave('login')}
      >
        {loginMode === 'view' ? (
          <div className="space-y-3 text-sm text-stone-800">
            <div>
              <span className="text-slate-400">手机号</span>
              <div className="mt-1 rounded-lg bg-stone-50 px-3 py-2">{loginName || '未填写'}</div>
            </div>
            <div>
              <span className="text-slate-400">登录密码</span>
              <div className="mt-1 rounded-lg bg-stone-50 px-3 py-2">{hasPassword ? '已设置' : '未设置'}</div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-slate-400 text-xs">登录账号（选填）— 设置后可使用手机号与密码登录</p>
            <label className="block">
              <span className="text-slate-400">手机号</span>
              <input
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={loginName}
                onFocus={focus.onFocus}
                onChange={(e) => {
                  lockForm()
                  setLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))
                }}
              />
            </label>
            <label className="block">
              <span className="text-slate-400">登录密码</span>
              <input
                type="password"
                className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
                value={password}
                onFocus={focus.onFocus}
                onChange={(e) => {
                  lockForm()
                  setPassword(e.target.value)
                }}
                placeholder={hasPassword ? '留空则不修改原密码' : '至少 6 位，可不填'}
              />
            </label>
          </>
        )}
      </ProfileEnvelope>

      <ProfileEnvelope
        title="主体信息"
        summary={(form.accountType === 'personal' ? form.personalName : form.companyName) || '未填写'}
        open={openOrg}
        readOnly={orgMode === 'view'}
        saving={saving}
        onView={
          (form.accountType === 'personal' ? form.personalName : form.companyName)
            ? () => {
                setOrgMode('view')
                setOpenOrg(true)
              }
            : undefined
        }
        onEdit={() => {
          setOrgMode('edit')
          setOpenOrg(true)
        }}
        onClose={() => setOpenOrg(false)}
        onSave={() => void onSave('org')}
      >
        <div className="flex gap-2">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm ${form.accountType === t.id ? 'bg-violet-600 text-white' : 'bg-stone-100 text-stone-700'}`}
              onClick={() => setField('accountType', t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-slate-400">{orgLabel}</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={form.accountType === 'personal' ? form.personalName : form.companyName}
            onFocus={focus.onFocus}
            onChange={(e) =>
              form.accountType === 'personal'
                ? setField('personalName', e.target.value)
                : setField('companyName', e.target.value)
            }
          />
        </label>
        <div className="block">
          <span className="text-slate-400">{form.accountType === 'personal' ? 'Logo' : '公司 Logo'}</span>
          <p className="mt-0.5 text-xs text-slate-500">建议上传 PNG 图片，将显示在分享海报和招募封面左上角</p>
          <div className="mt-2 flex items-center gap-3">
            {form.companyLogoUrl ? (
              <img src={form.companyLogoUrl} alt="" className="h-14 w-14 rounded-xl border border-stone-200 object-contain bg-white" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-stone-300 text-xs text-slate-500">
                Logo
              </span>
            )}
            <label className="lq-env-editonly cursor-pointer rounded-lg bg-stone-100 px-3 py-1.5 text-sm text-stone-800">
              {logoUploading ? '上传中…' : '上传图片'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={logoUploading || orgMode === 'view'}
                onChange={(e) => void onPickLogo(e)}
              />
            </label>
            {form.companyLogoUrl ? (
              <button type="button" className="lq-env-editonly text-sm text-slate-400" onClick={() => setField('companyLogoUrl', '')}>
                移除
              </button>
            ) : null}
          </div>
        </div>
        {form.accountType === 'company' ? (
          <label className="block">
            <span className="text-slate-400">联系人</span>
            <input
              className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
              value={form.contactName}
              onFocus={focus.onFocus}
              onChange={(e) => setField('contactName', e.target.value)}
            />
          </label>
        ) : null}
        <label className="block">
          <span className="text-slate-400">简介</span>
          <textarea
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2 min-h-[80px]"
            value={form.intro}
            onFocus={focus.onFocus}
            onChange={(e) => setField('intro', e.target.value)}
          />
        </label>
      </ProfileEnvelope>

      <ProfileEnvelope
        title="联系信息"
        summary={`${form.contactPhone || '未填写电话'}${form.city ? ` · ${form.city}` : ''}`}
        open={openContact}
        readOnly={contactMode === 'view'}
        saving={saving}
        onView={
          form.contactPhone || form.wechatId || form.province || form.city
            ? () => {
                setContactMode('view')
                setOpenContact(true)
              }
            : undefined
        }
        onEdit={() => {
          setContactMode('edit')
          setOpenContact(true)
        }}
        onClose={() => setOpenContact(false)}
        onSave={() => void onSave('contact')}
      >
        <label className="block">
          <span className="text-slate-400">联系电话 *</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={form.contactPhone}
            onFocus={focus.onFocus}
            onChange={(e) => setField('contactPhone', e.target.value)}
            placeholder="便于合作方联系"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">微信号 *</span>
          <input
            className="mt-1 w-full rounded-lg panel-input border px-3 py-2"
            value={form.wechatId}
            onFocus={focus.onFocus}
            onChange={(e) => setField('wechatId', e.target.value)}
            placeholder="请填写微信号（非微信昵称）"
          />
        </label>
        <RegionSelect
          province={form.province}
          city={form.city}
          onChange={(province, city) => {
            lockForm()
            setForm((f) => ({ ...f, province, city }))
          }}
          onDefaultFill={(province, city) => {
            if (formLockedRef.current) return
            setForm((f) => ({ ...f, province, city }))
          }}
          onFocus={lockForm}
        />
      </ProfileEnvelope>

      {msg ? <p className="text-sm text-amber-400">{msg}</p> : null}
    </div>
  )
}
