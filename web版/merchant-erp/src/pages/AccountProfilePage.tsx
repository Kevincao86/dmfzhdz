import { Camera, KeyRound, Loader2, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import AccountIdentityBindPanel from '../components/AccountIdentityBindPanel'
import SecretInput from '../components/SecretInput'
import { cn } from '../cn'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import {
  postAuthIdentity,
  sendAuthEmailCode,
  sendAuthSms,
  type IdentityActionResult,
} from '../lib/tenantRegisterApi'
import { toUserFacingError } from '../lib/userFacingError'

function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 160
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法处理图片'))
        return
      }
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法读取'))
    }
    img.src = url
  })
}

export default function AccountProfilePage() {
  const [loginName, setLoginName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [ids, setIds] = useState<IdentityActionResult['identities']>()
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileHint, setProfileHint] = useState('')
  const [profileErr, setProfileErr] = useState('')

  const [pwChannel, setPwChannel] = useState<'phone' | 'email'>('phone')
  const [pwCode, setPwCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState('')
  const [pwOk, setPwOk] = useState('')
  const [pwCooldown, setPwCooldown] = useState(0)
  const [pwSending, setPwSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token || ''
    if (!token) return
    const r = await postAuthIdentity({ action: 'identities', access_token: token })
    if (!r.ok) return
    setIds(r.identities)
    setLoginName(r.loginName || '')
    setDisplayName(r.displayName || r.loginName || '')
    setAvatarUrl(r.avatarUrl || '')
    if (r.identities?.email && !r.identities.phone) setPwChannel('email')
    else if (r.identities?.phone) setPwChannel('phone')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (pwCooldown <= 0) return
    const t = window.setTimeout(() => setPwCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [pwCooldown])

  const both = Boolean(ids?.phone && ids?.email)
  const onlyEmail = Boolean(ids?.email && !ids?.phone)
  const onlyPhone = Boolean(ids?.phone && !ids?.email)
  const channel = useMemo(() => {
    if (onlyEmail) return 'email' as const
    if (onlyPhone) return 'phone' as const
    return pwChannel
  }, [onlyEmail, onlyPhone, pwChannel])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileErr('')
    setProfileHint('')
    const token = (await supabase?.auth.getSession())?.data.session?.access_token || ''
    setSavingProfile(true)
    try {
      const r = await postAuthIdentity({
        action: 'update_profile',
        access_token: token,
        displayName,
        avatarUrl,
      })
      if (!r.ok) {
        setProfileErr(r.message || '保存失败')
        return
      }
      setProfileHint('资料已保存')
      if (r.displayName) setDisplayName(r.displayName)
      if (r.avatarUrl != null) setAvatarUrl(r.avatarUrl)
      await supabase?.auth.getUser()
    } finally {
      setSavingProfile(false)
    }
  }

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return
    setProfileErr('')
    try {
      const data = await compressAvatar(file)
      setAvatarUrl(data)
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : '头像处理失败')
    }
  }

  const sendPwCode = async () => {
    if (pwSending || pwCooldown > 0) return
    setPwErr('')
    setPwOk('')
    setPwSending(true)
    try {
      const tokenUser = (await supabase?.auth.getUser())?.data.user
      const meta = tokenUser?.user_metadata as { phone?: string; bind_email?: string } | undefined
      if (channel === 'phone') {
        const mobile = String(tokenUser?.phone || meta?.phone || '').replace(/\D/g, '').replace(/^86/, '')
        if (!/^1\d{10}$/.test(mobile)) {
          setPwErr('当前账号未绑定有效手机号')
          return
        }
        const r = await sendAuthSms(mobile)
        if (!r.ok) {
          setPwErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
          return
        }
        setPwCooldown(60)
        if (r.devCode) setPwCode(r.devCode)
        setPwOk(r.message ?? '验证码已发送')
        return
      }
      const mail = String(meta?.bind_email || '').trim()
      if (!mail) {
        setPwErr('当前账号未绑定邮箱')
        return
      }
      const r = await sendAuthEmailCode(mail)
      if (!r.ok) {
        setPwErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setPwCooldown(60)
      if (r.devCode) setPwCode(r.devCode)
      setPwOk(r.message ?? '验证码已发送至邮箱')
    } finally {
      setPwSending(false)
    }
  }

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwErr('')
    setPwOk('')
    if (!/^\d{6}$/.test(pwCode.trim())) {
      setPwErr('请输入 6 位验证码')
      return
    }
    if (newPassword.length < 6) {
      setPwErr('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwErr('两次输入的新密码不一致')
      return
    }
    const token = (await supabase?.auth.getSession())?.data.session?.access_token || ''
    setPwBusy(true)
    try {
      const r = await postAuthIdentity({
        action: 'change_password',
        access_token: token,
        channel,
        smsCode: channel === 'phone' ? pwCode.trim() : undefined,
        emailCode: channel === 'email' ? pwCode.trim() : undefined,
        newPassword,
      })
      if (!r.ok) {
        setPwErr(r.message || '改密失败')
        return
      }
      setPwOk(r.message || '密码已更新')
      setPwCode('')
      setNewPassword('')
      setConfirmPassword('')
    } finally {
      setPwBusy(false)
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        当前未启用云端登录，无法编辑个人资料。
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">个人中心</h1>
        <p className="mt-1 text-sm text-slate-500">管理头像、昵称、登录密码，以及手机号 / 邮箱换绑。</p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">基本资料</h2>
        <form className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start" onSubmit={(e) => void saveProfile(e)}>
          <div className="shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickAvatar(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-10 w-10 text-slate-400" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-xs text-white opacity-0 transition group-hover:opacity-100">
                <Camera className="mr-1 h-3.5 w-3.5" />
                更换
              </span>
            </button>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">登录名</label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                value={loginName}
                readOnly
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">昵称</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
                value={displayName}
                maxLength={30}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 30))}
                placeholder="显示在工作台右上角"
              />
            </div>
            {profileErr ? <p className="text-sm text-red-600">{profileErr}</p> : null}
            {profileHint ? <p className="text-sm text-emerald-700">{profileHint}</p> : null}
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingProfile ? '保存中…' : '保存资料'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <AccountIdentityBindPanel />
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">修改登录密码</h2>
            <p className="mt-1 text-sm text-slate-500">
              {onlyEmail
                ? '使用绑定邮箱收取验证码后设置新密码。'
                : onlyPhone
                  ? '使用绑定手机号收取验证码后设置新密码。'
                  : both
                    ? '手机号与邮箱均已绑定，任选一种验证即可。'
                    : '请先绑定手机号或邮箱后再修改密码。'}
            </p>
          </div>
        </div>

        {both ? (
          <div className="mb-4 flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium',
                channel === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
              onClick={() => setPwChannel('phone')}
            >
              手机验证码
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium',
                channel === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
              onClick={() => setPwChannel('email')}
            >
              邮箱验证码
            </button>
          </div>
        ) : null}

        {ids?.phone || ids?.email ? (
          <form className="max-w-md space-y-3" onSubmit={(e) => void submitPassword(e)}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {channel === 'email' ? '邮箱验证码' : '短信验证码'}
              </label>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-400"
                  inputMode="numeric"
                  maxLength={6}
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位验证码"
                />
                <button
                  type="button"
                  disabled={pwSending || pwCooldown > 0 || pwBusy}
                  onClick={() => void sendPwCode()}
                  className="shrink-0 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm font-medium text-cyan-800 hover:bg-cyan-50 disabled:opacity-60"
                >
                  {pwSending ? '发送中…' : pwCooldown > 0 ? `${pwCooldown}s` : '获取验证码'}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {channel === 'email'
                  ? ids?.emailMasked
                    ? `将发至 ${ids.emailMasked}`
                    : '将发至绑定邮箱'
                  : ids?.phoneMasked
                    ? `将发至 ${ids.phoneMasked}`
                    : '将发至绑定手机'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">新密码</label>
              <SecretInput
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">确认新密码</label>
              <SecretInput
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {pwErr ? <p className="text-sm text-red-600">{pwErr}</p> : null}
            {pwOk ? <p className="text-sm text-emerald-700">{pwOk}</p> : null}
            <button
              type="submit"
              disabled={pwBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {pwBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存新密码
            </button>
          </form>
        ) : null}
      </section>
    </div>
  )
}
