import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '../../cn'
import { supabase } from '../../lib/supabaseClient'
import { loginNameToTenantEmail } from '../../lib/tenantAuthEmail'
import { clearTenantScopedBrowserState, setActiveTenantStorageId } from '../../lib/tenantLocalState'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
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
  'w-full rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-base text-slate-900 outline-none backdrop-blur-sm placeholder:text-slate-400 focus:border-cyan-300/80 focus:bg-white/80 focus:ring-2 focus:ring-cyan-500/20 sm:text-sm'

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

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
      clearTenantScopedBrowserState()
      const tid = await fetchPrimaryTenantId(supabase)
      setActiveTenantStorageId(tid)
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
        const hint =
          r.message ??
          (r.error === 'supabase_admin_not_configured'
            ? '登录服务未配置 SUPABASE_SERVICE_ROLE_KEY，请联系管理员'
            : '验证码登录失败')
        onErr(import.meta.env.DEV && r.detail ? `${hint}（${r.detail.slice(0, 80)}）` : hint)
        return
      }
      const ok = await applySessionTokens(r.access_token, r.refresh_token)
      if (ok) {
        clearTenantScopedBrowserState()
        if (supabase) {
          const tid = await fetchPrimaryTenantId(supabase)
          setActiveTenantStorageId(tid)
        }
        onLoginSuccess()
      }
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
        onErr(r.message ?? r.error ?? '验证码发送失败')
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
        onErr(r.message ?? r.error ?? '验证码发送失败')
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

  const primaryBtn =
    'w-full rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#14b8a6] py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(14,165,233,0.45)] transition hover:shadow-[0_12px_28px_-6px_rgba(14,165,233,0.5)] disabled:opacity-60'

  const smsBtn =
    'shrink-0 rounded-xl border border-white/70 bg-white/60 px-3 py-3 text-xs font-semibold text-cyan-700 backdrop-blur-sm hover:bg-white/80 disabled:opacity-50 sm:px-4 sm:text-sm'

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col">
      <div className="mb-8 hidden lg:block">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">欢迎登录</h2>
        <p className="mt-2 text-sm text-slate-600">使用商家账号进入墨典AI智能ERP工作台</p>
      </div>
      <div className="mb-6 border-b border-white/50">
        <div className="flex gap-8">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn(
              'relative pb-3 text-base font-semibold transition-colors',
              mode === 'login' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            登录
            {mode === 'login' ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn(
              'relative pb-3 text-base font-semibold transition-colors',
              mode === 'register' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            注册
            {mode === 'register' ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" />
            ) : null}
          </button>
        </div>
        <p className="pb-4 text-xs leading-relaxed text-slate-500 lg:hidden">
          {mode === 'login'
            ? loginMethod === 'password'
              ? '使用登录名与密码进入商家工作台。'
              : '使用注册手机号与短信验证码登录。'
            : '填写商家信息并完成手机验证，注册后为免费版，可订阅升级会员。'}
        </p>
      </div>

      <div>
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-white/50 bg-white/40 px-4 py-3 backdrop-blur-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/70 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-cyan-600" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-800">安全可信</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              短信由阿里云发送，会话经 Supabase Auth 加密存储。
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
            <div className="mb-5 flex gap-6 border-b border-white/40 pb-1">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password')
                  onErr(null)
                }}
                className={cn(
                  'relative pb-2 text-sm font-semibold transition-colors',
                  loginMethod === 'password'
                    ? 'text-slate-900'
                    : 'text-slate-400 hover:text-slate-600',
                )}
              >
                账号密码
                {loginMethod === 'password' ? (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-500" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('sms')
                  onErr(null)
                }}
                className={cn(
                  'relative pb-2 text-sm font-semibold transition-colors',
                  loginMethod === 'sms'
                    ? 'text-slate-900'
                    : 'text-slate-400 hover:text-slate-600',
                )}
              >
                手机验证码
              </button>
            </div>

            {loginMethod === 'password' ? (
              <form className="space-y-5" onSubmit={(e) => void submitPasswordLogin(e)}>
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
                  className={primaryBtn}
                >
                  {busy ? '登录中…' : '进入工作台'}
                </button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={(e) => void submitSmsLogin(e)}>
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
                      className={smsBtn}
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
                  className={primaryBtn}
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
                  className={smsBtn}
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
              className={primaryBtn}
            >
              {busy ? '注册中…' : '确认注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
