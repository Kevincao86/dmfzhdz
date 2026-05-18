import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '../../cn'
import { supabase } from '../../lib/supabaseClient'
import { loginNameToTenantEmail } from '../../lib/tenantAuthEmail'
import {
  isCnMobileValid,
  isLoginNameValid,
  isMerchantShortNameValid,
  loginWithSmsCode,
  registerMerchantAccount,
  sendAuthSms,
} from '../../lib/tenantRegisterApi'

type AuthMode = 'login' | 'register'
type LoginMethod = 'password' | 'sms'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/15 sm:text-sm'

const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500'

type Props = {
  infoHint: string | null
  err: string | null
  onInfoHint: (v: string | null) => void
  onErr: (v: string | null) => void
  onLoginSuccess: () => void
}

export default function LoginAuthPanel({ infoHint, err, onInfoHint, onErr, onLoginSuccess }: Props) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password')
  const [busy, setBusy] = useState(false)

  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')

  const [loginPhone, setLoginPhone] = useState('')
  const [loginSmsCode, setLoginSmsCode] = useState('')
  const [loginSmsCooldown, setLoginSmsCooldown] = useState(0)
  const [loginSmsSending, setLoginSmsSending] = useState(false)

  const [regLoginName, setRegLoginName] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [smsSending, setSmsSending] = useState(false)

  useEffect(() => {
    if (smsCooldown <= 0) return
    const t = window.setTimeout(() => setSmsCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [smsCooldown])

  useEffect(() => {
    if (loginSmsCooldown <= 0) return
    const t = window.setTimeout(() => setLoginSmsCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [loginSmsCooldown])

  const switchMode = (next: AuthMode) => {
    setMode(next)
    onErr(null)
    onInfoHint(null)
  }

  const applySessionTokens = async (access_token: string, refresh_token: string) => {
    if (!supabase) return false
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) {
      onErr(error.message)
      return false
    }
    const { data: after } = await supabase.auth.getSession()
    if (!after.session) {
      onErr('登录已成功，但未读到会话。请刷新本页或稍后再试。')
      return false
    }
    return true
  }

  const submitPasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    onErr(null)
    onInfoHint(null)
    const name = loginName.trim()
    if (name.length < 2) {
      onErr('账户名至少 2 个字符')
      return
    }
    if (password.length < 6) {
      onErr('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const email = loginNameToTenantEmail(name)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        onErr(error.message.includes('Invalid login') ? '账号或密码错误' : error.message)
        return
      }
      const { data: after } = await supabase.auth.getSession()
      if (!after.session) {
        onErr('登录已成功，但未读到会话。请刷新本页或稍后再试。')
        return
      }
      onLoginSuccess()
    } finally {
      setBusy(false)
    }
  }

  const submitSmsLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    onErr(null)
    onInfoHint(null)
    const mobile = loginPhone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号（11 位）')
      return
    }
    if (!/^\d{6}$/.test(loginSmsCode.trim())) {
      onErr('请输入 6 位短信验证码')
      return
    }
    setBusy(true)
    try {
      const r = await loginWithSmsCode({ phone: mobile, smsCode: loginSmsCode.trim() })
      if (!r.ok || !r.access_token || !r.refresh_token) {
        onErr(r.message ?? '验证码登录失败')
        return
      }
      const ok = await applySessionTokens(r.access_token, r.refresh_token)
      if (ok) onLoginSuccess()
    } finally {
      setBusy(false)
    }
  }

  const sendSmsForRegister = useCallback(async () => {
    onErr(null)
    const mobile = phone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号（11 位）')
      return
    }
    setSmsSending(true)
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        onErr(r.message ?? '验证码发送失败')
        return
      }
      setSmsCooldown(60)
      if (r.devCode) {
        setSmsCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送')
      }
    } finally {
      setSmsSending(false)
    }
  }, [phone, onErr, onInfoHint])

  const sendSmsForLogin = useCallback(async () => {
    onErr(null)
    const mobile = loginPhone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号（11 位）')
      return
    }
    setLoginSmsSending(true)
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        onErr(r.message ?? '验证码发送失败')
        return
      }
      setLoginSmsCooldown(60)
      if (r.devCode) {
        setLoginSmsCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送')
      }
    } finally {
      setLoginSmsSending(false)
    }
  }, [loginPhone, onErr, onInfoHint])

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault()
    onErr(null)
    onInfoHint(null)
    const ln = regLoginName.trim()
    const mn = merchantName.trim()
    const mobile = phone.replace(/\D/g, '')

    if (!isLoginNameValid(ln)) {
      onErr('登录名须为 4–32 位字母或数字组合')
      return
    }
    if (!isMerchantShortNameValid(mn)) {
      onErr('商家简称 2–30 字，可输入汉字、字母或数字')
      return
    }
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      onErr('请输入 6 位短信验证码')
      return
    }
    if (regPassword.length < 6) {
      onErr('密码至少 6 位')
      return
    }
    if (regPassword !== confirmPassword) {
      onErr('两次输入的密码不一致')
      return
    }

    setBusy(true)
    try {
      const r = await registerMerchantAccount({
        loginName: ln,
        merchantName: mn,
        phone: mobile,
        smsCode: smsCode.trim(),
        password: regPassword,
        confirmPassword,
      })
      if (!r.ok) {
        onErr(r.message ?? r.detail ?? '注册失败')
        return
      }
      setLoginName(ln)
      setLoginPhone(mobile)
      setPassword('')
      switchMode('login')
      setLoginMethod('password')
      onInfoHint(r.message ?? '注册成功，请登录')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full shrink-0 rounded-3xl border border-white/15 bg-white/95 shadow-2xl shadow-cyan-950/25 ring-1 ring-white/25 backdrop-blur-md max-h-[min(640px,calc(100dvh-14rem))] overflow-y-auto lg:max-h-[min(720px,calc(100dvh-8rem))]">
      <div className="sticky top-0 z-[1] border-b border-slate-200/90 bg-gradient-to-r from-slate-50 to-cyan-50/80 px-5 py-3.5">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              mode === 'login' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              mode === 'register' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            注册
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {mode === 'login'
            ? loginMethod === 'password'
              ? '使用登录名与密码进入商家工作台。'
              : '使用注册手机号与短信验证码登录。'
            : '填写商家信息并完成手机验证，注册后可立即登录（含 14 天试用）。'}
        </p>
      </div>

      <div className="px-5 pb-6 pt-5 sm:px-7">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-orange-400/15 ring-1 ring-slate-200/80">
            <ShieldCheck className="h-5 w-5 text-cyan-700" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-xs font-semibold text-slate-800">安全可信</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              短信验证码由阿里云号码认证服务发送，会话经 Supabase Auth 加密。
            </p>
          </div>
        </div>

        {infoHint ? (
          <p className="mb-4 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 py-2.5 text-center text-sm text-cyan-950">
            {infoHint}
          </p>
        ) : null}

        {mode === 'login' ? (
          <>
            <div className="mb-4 flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password')
                  onErr(null)
                }}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                  loginMethod === 'password'
                    ? 'bg-white text-cyan-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800',
                )}
              >
                账号密码
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('sms')
                  onErr(null)
                }}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                  loginMethod === 'sms'
                    ? 'bg-white text-cyan-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800',
                )}
              >
                手机验证码
              </button>
            </div>

            {loginMethod === 'password' ? (
              <form className="space-y-4" onSubmit={(e) => void submitPasswordLogin(e)}>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-name">
                    登录名
                  </label>
                  <input
                    id="meoo-login-name"
                    className={inputClass}
                    autoComplete="username"
                    placeholder="字母与数字，4–32 位"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-pw">
                    密码
                  </label>
                  <input
                    id="meoo-login-pw"
                    type="password"
                    className={inputClass}
                    autoComplete="current-password"
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 disabled:opacity-60"
                >
                  {busy ? '登录中…' : '进入工作台'}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={(e) => void submitSmsLogin(e)}>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-phone">
                    手机号
                  </label>
                  <input
                    id="meoo-login-phone"
                    className={inputClass}
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="11 位大陆手机号"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-sms">
                    短信验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="meoo-login-sms"
                      className={cn(inputClass, 'min-w-0 flex-1')}
                      inputMode="numeric"
                      placeholder="6 位验证码"
                      value={loginSmsCode}
                      onChange={(e) => setLoginSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <button
                      type="button"
                      disabled={loginSmsSending || loginSmsCooldown > 0 || busy}
                      onClick={() => void sendSmsForLogin()}
                      className="shrink-0 rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50 sm:px-4 sm:text-sm"
                    >
                      {loginSmsSending ? '发送中…' : loginSmsCooldown > 0 ? `${loginSmsCooldown}s` : '获取验证码'}
                    </button>
                  </div>
                </div>
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 disabled:opacity-60"
                >
                  {busy ? '登录中…' : '验证码登录'}
                </button>
              </form>
            )}
          </>
        ) : (
          <form className="space-y-3.5" onSubmit={(e) => void submitRegister(e)}>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-login">
                登录名 <span className="normal-case text-slate-400">（字母+数字）</span>
              </label>
              <input
                id="meoo-reg-login"
                className={inputClass}
                autoComplete="username"
                placeholder="如 shop2026"
                value={regLoginName}
                onChange={(e) => setRegLoginName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32))}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-merchant">
                商家名简称
              </label>
              <input
                id="meoo-reg-merchant"
                className={inputClass}
                placeholder="可输入汉字，如：墨典咖啡"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value.slice(0, 30))}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-phone">
                手机号
              </label>
              <input
                id="meoo-reg-phone"
                className={inputClass}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="11 位大陆手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-sms">
                短信验证码
              </label>
              <div className="flex gap-2">
                <input
                  id="meoo-reg-sms"
                  className={cn(inputClass, 'min-w-0 flex-1')}
                  inputMode="numeric"
                  placeholder="6 位验证码"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  type="button"
                  disabled={smsSending || smsCooldown > 0 || busy}
                  onClick={() => void sendSmsForRegister()}
                  className="shrink-0 rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50 sm:px-4 sm:text-sm"
                >
                  {smsSending ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-pw">
                密码
              </label>
              <input
                id="meoo-reg-pw"
                type="password"
                className={inputClass}
                autoComplete="new-password"
                placeholder="至少 6 位"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-pw2">
                确认密码
              </label>
              <input
                id="meoo-reg-pw2"
                type="password"
                className={inputClass}
                autoComplete="new-password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {err ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 disabled:opacity-60"
            >
              {busy ? '注册中…' : '确认注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
