import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import EditionSwitchLink from '../../components/EditionSwitchLink'
import SecretInput from '../../components/SecretInput'
import { cn } from '../../cn'
import { supabase } from '../../lib/supabaseClient'
import { editionLabel, isPartnerEdition } from '../../lib/appEdition'
import {
  isRememberLoginEnabled,
  readRememberedLogin,
  writeRememberedLogin,
} from '../../lib/rememberLogin'
import RememberPasswordRow from '../../components/login/RememberPasswordRow'
import {
  isBindEmailValid,
  isCnMobileValid,
  isLoginNameValid,
  isMerchantShortNameValid,
  loginWithEmailCode,
  loginWithPasswordIdentifier,
  loginWithSmsCode,
  registerMerchantAccount,
  registerPartnerAccount,
  sendAuthEmailCode,
  sendAuthSms,
} from '../../lib/tenantRegisterApi'
import { clearPendingDistributionRef, readPendingDistributionRef } from '../../lib/pendingDistributionRef'
import { toUserFacingError } from '../../lib/userFacingError'
import ErpScanLoginPanel from '../../components/login/ErpScanLoginPanel'
import LoginAltMethods from '../../components/login/LoginAltMethods'
import LoginAltMethodsAgreeRow, { LOGIN_AGREE_REQUIRED } from '../../components/login/LoginAltMethodsAgreeRow'

type AuthMode = 'login' | 'register'
type LoginMethod = 'password' | 'sms' | 'email' | 'wechat' | 'douyin'

const inputClass =
  'w-full rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-base text-slate-900 outline-none backdrop-blur-sm placeholder:text-slate-400 focus:border-cyan-300/80 focus:bg-white/80 focus:ring-2 focus:ring-cyan-500/20 sm:text-sm'

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

type Props = {
  initialMode?: 'login' | 'register'
  pendingRefCode?: string | null
  infoHint: string | null
  err: string | null
  onInfoHint: (v: string | null) => void
  onErr: (v: string | null) => void
  onLoginSuccess: () => void
}

export default function LoginAuthPanel({
  initialMode,
  pendingRefCode,
  infoHint,
  err,
  onInfoHint,
  onErr,
  onLoginSuccess,
}: Props) {
  const partnerMode = isPartnerEdition()
  const [mode, setMode] = useState<AuthMode>(initialMode === 'register' ? 'register' : 'login')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password')
  const [busy, setBusy] = useState(false)

  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')

  const [loginPhone, setLoginPhone] = useState('')
  const [loginSmsCode, setLoginSmsCode] = useState('')
  const [loginSmsCooldown, setLoginSmsCooldown] = useState(0)
  const [loginSmsSending, setLoginSmsSending] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginEmailCode, setLoginEmailCode] = useState('')
  const [loginEmailCooldown, setLoginEmailCooldown] = useState(0)
  const [loginEmailSending, setLoginEmailSending] = useState(false)
  const rememberScope = partnerMode ? 'partner' : 'merchant'
  const [rememberPassword, setRememberPassword] = useState(() => isRememberLoginEnabled(rememberScope))
  const [agreed, setAgreed] = useState(false)

  const [regLoginName, setRegLoginName] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [regChannel, setRegChannel] = useState<'phone' | 'email'>('phone')
  const [regEmail, setRegEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [emailSending, setEmailSending] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [smsSending, setSmsSending] = useState(false)
  const smsInflightRef = useRef(false)
  const loginSmsInflightRef = useRef(false)
  const emailInflightRef = useRef(false)
  const loginEmailInflightRef = useRef(false)

  useEffect(() => {
    if (smsCooldown <= 0) return
    const t = window.setTimeout(() => setSmsCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [smsCooldown])

  useEffect(() => {
    if (emailCooldown <= 0) return
    const t = window.setTimeout(() => setEmailCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [emailCooldown])

  useEffect(() => {
    if (loginEmailCooldown <= 0) return
    const t = window.setTimeout(() => setLoginEmailCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [loginEmailCooldown])

  useEffect(() => {
    const saved = readRememberedLogin(rememberScope)
    if (saved) {
      setLoginName(saved.loginName)
      setPassword(saved.password)
      setRememberPassword(true)
    }
  }, [rememberScope])

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
    if (!agreed) {
      onErr(LOGIN_AGREE_REQUIRED)
      return
    }
    const name = loginName.trim()
    if (name.length < 2) {
      onErr('请输入登录名、手机号或邮箱')
      return
    }
    if (password.length < 6) {
      onErr('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      const r = await loginWithPasswordIdentifier({ identifier: name, password })
      if (!r.ok || !r.access_token || !r.refresh_token) {
        onErr(r.message ?? '账号或密码错误')
        return
      }
      const ok = await applySessionTokens(r.access_token, r.refresh_token)
      if (!ok) return
      if (rememberPassword) {
        writeRememberedLogin(rememberScope, { loginName: r.loginName || name, password })
      } else {
        writeRememberedLogin(rememberScope, null)
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
    if (!agreed) {
      onErr(LOGIN_AGREE_REQUIRED)
      return
    }
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
            ? '登录服务未完全配置，请联系管理员'
            : '验证码登录失败')
        onErr(import.meta.env.DEV && r.detail ? `${hint}（${r.detail.slice(0, 80)}）` : hint)
        return
      }
      const ok = await applySessionTokens(r.access_token, r.refresh_token)
      if (ok) {
        onLoginSuccess()
      }
    } finally {
      setBusy(false)
    }
  }

  const submitEmailLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    onErr(null)
    onInfoHint(null)
    if (!agreed) {
      onErr(LOGIN_AGREE_REQUIRED)
      return
    }
    const mail = loginEmail.trim()
    if (!isBindEmailValid(mail)) {
      onErr('请输入有效邮箱')
      return
    }
    if (!/^\d{6}$/.test(loginEmailCode.trim())) {
      onErr('请输入 6 位邮箱验证码')
      return
    }
    setBusy(true)
    try {
      const r = await loginWithEmailCode({ email: mail, emailCode: loginEmailCode.trim() })
      if (!r.ok || !r.access_token || !r.refresh_token) {
        onErr(r.message ?? (r.error === 'email_not_registered' ? '该邮箱尚未注册，请先注册' : '验证码登录失败'))
        return
      }
      const ok = await applySessionTokens(r.access_token, r.refresh_token)
      if (ok) onLoginSuccess()
    } finally {
      setBusy(false)
    }
  }

  const sendSmsForRegister = useCallback(async () => {
    if (smsInflightRef.current || smsSending || smsCooldown > 0) return
    onErr(null)
    const mobile = phone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号（11 位）')
      return
    }
    smsInflightRef.current = true
    setSmsSending(true)
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        onErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setSmsCooldown(60)
      if (r.devCode && import.meta.env.DEV) {
        setSmsCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送')
      }
    } finally {
      smsInflightRef.current = false
      setSmsSending(false)
    }
  }, [phone, onErr, onInfoHint, smsSending, smsCooldown])

  const sendEmailForRegister = useCallback(async () => {
    if (emailInflightRef.current || emailSending || emailCooldown > 0) return
    onErr(null)
    onInfoHint(null)
    const mail = regEmail.trim()
    if (!isBindEmailValid(mail)) {
      onErr('请输入有效邮箱')
      return
    }
    emailInflightRef.current = true
    setEmailSending(true)
    try {
      const r = await sendAuthEmailCode(mail)
      if (!r.ok) {
        onErr(toUserFacingError(r.message ?? r.error, '邮箱验证码发送'))
        return
      }
      setEmailCooldown(60)
      if (r.devCode && import.meta.env.DEV) {
        setEmailCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送至邮箱')
      }
    } finally {
      emailInflightRef.current = false
      setEmailSending(false)
    }
  }, [regEmail, onErr, onInfoHint, emailSending, emailCooldown])

  const sendSmsForLogin = useCallback(async () => {
    if (loginSmsInflightRef.current || loginSmsSending || loginSmsCooldown > 0) return
    onErr(null)
    const mobile = loginPhone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      onErr('请输入有效的大陆手机号（11 位）')
      return
    }
    loginSmsInflightRef.current = true
    setLoginSmsSending(true)
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        onErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setLoginSmsCooldown(60)
      if (r.devCode && import.meta.env.DEV) {
        setLoginSmsCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送')
      }
    } finally {
      loginSmsInflightRef.current = false
      setLoginSmsSending(false)
    }
  }, [loginPhone, onErr, onInfoHint, loginSmsSending, loginSmsCooldown])

  const sendEmailForLogin = useCallback(async () => {
    if (loginEmailInflightRef.current || loginEmailSending || loginEmailCooldown > 0) return
    onErr(null)
    onInfoHint(null)
    const mail = loginEmail.trim()
    if (!isBindEmailValid(mail)) {
      onErr('请输入有效邮箱')
      return
    }
    loginEmailInflightRef.current = true
    setLoginEmailSending(true)
    try {
      const r = await sendAuthEmailCode(mail)
      if (!r.ok) {
        onErr(toUserFacingError(r.message ?? r.error, '邮箱验证码发送'))
        return
      }
      setLoginEmailCooldown(60)
      if (r.devCode && import.meta.env.DEV) {
        setLoginEmailCode(r.devCode)
        onInfoHint(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        onInfoHint(r.message ?? '验证码已发送至邮箱')
      }
    } finally {
      loginEmailInflightRef.current = false
      setLoginEmailSending(false)
    }
  }, [loginEmail, onErr, onInfoHint, loginEmailSending, loginEmailCooldown])

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault()
    onErr(null)
    onInfoHint(null)
    if (!agreed) {
      onErr(LOGIN_AGREE_REQUIRED)
      return
    }
    const ln = regLoginName.trim()
    const mn = merchantName.trim()
    const mobile = phone.replace(/\D/g, '')
    const mail = regEmail.trim()

    if (!isLoginNameValid(ln)) {
      onErr('登录名须为 4–32 位字母或数字组合')
      return
    }
    if (!isMerchantShortNameValid(mn)) {
      onErr(partnerMode ? '服务商简称 2–30 字' : '商家简称 2–30 字，可输入汉字、字母或数字')
      return
    }
    if (regChannel === 'phone') {
      if (!isCnMobileValid(mobile)) {
        onErr('请输入有效的大陆手机号')
        return
      }
      if (!/^\d{6}$/.test(smsCode.trim())) {
        onErr('请输入 6 位短信验证码')
        return
      }
    } else {
      if (!isBindEmailValid(mail)) {
        onErr('请输入有效邮箱')
        return
      }
      if (!/^\d{6}$/.test(emailCode.trim())) {
        onErr('请输入 6 位邮箱验证码')
        return
      }
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
      const r = partnerMode
        ? await registerPartnerAccount({
            loginName: ln,
            partnerName: mn,
            phone: regChannel === 'phone' ? mobile : undefined,
            smsCode: regChannel === 'phone' ? smsCode.trim() : undefined,
            email: regChannel === 'email' ? mail : undefined,
            emailCode: regChannel === 'email' ? emailCode.trim() : undefined,
            password: regPassword,
            confirmPassword,
          })
        : await registerMerchantAccount({
            loginName: ln,
            merchantName: mn,
            phone: regChannel === 'phone' ? mobile : undefined,
            smsCode: regChannel === 'phone' ? smsCode.trim() : undefined,
            email: regChannel === 'email' ? mail : undefined,
            emailCode: regChannel === 'email' ? emailCode.trim() : undefined,
            password: regPassword,
            confirmPassword,
            refCode: pendingRefCode || readPendingDistributionRef() || undefined,
          })
      if (!r.ok) {
        const base = toUserFacingError(r.message ?? r.detail ?? r.error, '注册')
        const showDetail =
          r.detail &&
          (r.error === 'auth_unreachable' ||
            r.error === 'tenant_insert_failed' ||
            r.error === 'member_insert_failed' ||
            r.error === 'auth_create_failed')
        const msg = showDetail ? `${base}（${r.detail}）` : base
        onErr(msg)
        return
      }
      setLoginName(ln)
      setLoginPhone(mobile)
      setPassword('')
      if (!partnerMode) clearPendingDistributionRef()
      switchMode('login')
      setLoginMethod('password')
      onInfoHint(r.message ?? '注册成功，请登录')
    } catch (e) {
      onErr(toUserFacingError(e, '注册'))
    } finally {
      setBusy(false)
    }
  }

  const primaryBtn =
    'w-full rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#14b8a6] py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(14,165,233,0.45)] transition hover:shadow-[0_12px_28px_-6px_rgba(14,165,233,0.5)] disabled:opacity-60'

  const smsBtn =
    'shrink-0 rounded-xl border border-white/70 bg-white/60 px-3 py-3 text-xs font-semibold text-cyan-700 backdrop-blur-sm hover:bg-white/80 disabled:opacity-50 sm:px-4 sm:text-sm'

  return (
    <div className="relative w-full">
      <div className="absolute right-0 top-0 z-10">
        <EditionSwitchLink />
      </div>
      <div className="mb-6 hidden pr-[7.5rem] lg:block">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {mode === 'login' ? '欢迎登录' : '欢迎注册'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {mode === 'login'
            ? `使用${editionLabel()}账号进入灵祺AI智能ERP工作台`
            : '填写信息完成注册，即可使用免费版'}
        </p>
      </div>
      <div className="mb-6 border-b border-white/50 pr-[7.5rem] pt-0.5">
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
              ? `使用登录名与密码进入${editionLabel()}工作台。`
              : loginMethod === 'sms'
                ? '使用注册手机号与短信验证码登录。'
                : loginMethod === 'email'
                  ? '使用注册邮箱与邮箱验证码登录。'
                  : loginMethod === 'wechat'
                    ? '使用微信扫码登录（需账号已绑定手机号）。'
                    : '使用抖音 App 扫码登录（需账号已绑定手机号）。'
            : partnerMode
              ? '填写服务商信息并用手机或邮箱验证，注册后可绑定平台服务商身份与客户商家。'
              : '填写商家信息并用手机或邮箱验证，注册后为免费版，可订阅升级会员。'}
        </p>
      </div>

      <div>
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-white/50 bg-white/40 px-4 py-3 backdrop-blur-sm">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/70 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-cyan-600" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold leading-none text-slate-800">安全可信</p>
            <p className="mt-2 text-[13px] leading-5 text-slate-500">
              短信由阿里云发送，邮箱验证码由灵祺发出。
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-slate-500">登录会话经加密存储。</p>
          </div>
        </div>

        {infoHint ? (
          <p className="mb-4 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 py-2.5 text-center text-sm text-cyan-950">
            {infoHint}
          </p>
        ) : null}

        {mode === 'login' ? (
          <>
            {loginMethod !== 'password' ? (
              <button
                type="button"
                className="mb-4 text-sm font-medium text-cyan-700 hover:underline"
                onClick={() => {
                  setLoginMethod('password')
                  onErr(null)
                }}
              >
                ← 账号密码登录
              </button>
            ) : null}

            {loginMethod === 'password' ? (
              <form className="space-y-5" onSubmit={(e) => void submitPasswordLogin(e)}>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-name">
                    登录名 / 手机号 / 邮箱
                  </label>
                  <input
                    id="meoo-login-name"
                    className={inputClass}
                    autoComplete="username"
                    placeholder="登录名、绑定手机号或绑定邮箱"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value.slice(0, 64))}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-pw">
                    密码
                  </label>
                  <SecretInput
                    id="meoo-login-pw"
                    className={inputClass}
                    autoComplete="current-password"
                    placeholder="至少 6 位"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    忘记密码？
                    <button
                      type="button"
                      className="ml-1 font-medium text-cyan-700 underline-offset-2 hover:underline"
                      onClick={() => {
                        setLoginMethod('sms')
                        onErr(null)
                        onInfoHint('已切换到手机验证码登录，验证通过即可进入工作台')
                      }}
                    >
                      切换手机或邮箱验证码登录
                    </button>
                  </p>
                </div>
                <RememberPasswordRow checked={rememberPassword} onChange={setRememberPassword} />
                <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} />
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !agreed}
                  className={primaryBtn}
                >
                  {busy ? '登录中…' : '进入工作台'}
                </button>
              </form>
            ) : loginMethod === 'sms' ? (
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
                <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} />
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !agreed}
                  className={primaryBtn}
                >
                  {busy ? '登录中…' : '验证码登录'}
                </button>
              </form>
            ) : loginMethod === 'email' ? (
              <form className="space-y-5" onSubmit={(e) => void submitEmailLogin(e)}>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-email">
                    邮箱
                  </label>
                  <input
                    id="meoo-login-email"
                    className={inputClass}
                    autoComplete="email"
                    placeholder="注册时绑定的邮箱"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value.trim())}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="meoo-login-email-code">
                    邮箱验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="meoo-login-email-code"
                      className={cn(inputClass, 'min-w-0 flex-1')}
                      inputMode="numeric"
                      placeholder="6 位验证码"
                      value={loginEmailCode}
                      onChange={(e) => setLoginEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <button
                      type="button"
                      disabled={loginEmailSending || loginEmailCooldown > 0}
                      onClick={() => void sendEmailForLogin()}
                      className={smsBtn}
                    >
                      {loginEmailSending
                        ? '发送中…'
                        : loginEmailCooldown > 0
                          ? `${loginEmailCooldown}s`
                          : '获取验证码'}
                    </button>
                  </div>
                  {err ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                  ) : null}
                  {infoHint ? <p className="mt-2 text-sm text-cyan-800">{infoHint}</p> : null}
                </div>
                <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} />
                {err ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
                ) : null}
                <button type="submit" disabled={busy || !agreed} className={primaryBtn}>
                  {busy ? '登录中…' : '验证码登录'}
                </button>
              </form>
            ) : (
              <>
                <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} className="mb-4" />
                {agreed ? (
                  <ErpScanLoginPanel
                    portal={partnerMode ? 'partner' : 'merchant'}
                    err={err}
                    onErr={onErr}
                    channel={loginMethod === 'wechat' ? 'wechat' : 'douyin'}
                  />
                ) : (
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-100">
                    {LOGIN_AGREE_REQUIRED}
                  </p>
                )}
              </>
            )}

            <LoginAltMethods
              activeId={loginMethod === 'password' ? undefined : loginMethod}
              onSelect={(id) => {
                if (id === 'password') return
                if (!agreed) {
                  onErr(LOGIN_AGREE_REQUIRED)
                  return
                }
                setLoginMethod(id)
                onErr(null)
                onInfoHint(null)
              }}
              methods={[
                { id: 'sms', label: '短信验证码' },
                { id: 'email', label: '邮箱登录' },
                {
                  id: 'wechat',
                  label: '微信登录',
                  hint: '微信开放平台网站应用审核通过后启用',
                },
                { id: 'douyin', label: '抖音登录' },
              ]}
            />
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
                {partnerMode ? '服务商简称' : '商家名简称'}
              </label>
              <input
                id="meoo-reg-merchant"
                className={inputClass}
                placeholder="可输入汉字，如：灵祺咖啡"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value.slice(0, 30))}
              />
            </div>
            <div className="flex gap-2 rounded-xl bg-slate-100/80 p-1">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg py-2 text-sm font-medium',
                  regChannel === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                )}
                onClick={() => setRegChannel('phone')}
              >
                手机号注册
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg py-2 text-sm font-medium',
                  regChannel === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                )}
                onClick={() => setRegChannel('email')}
              >
                邮箱注册
              </button>
            </div>
            {regChannel === 'phone' ? (
              <>
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
              </>
            ) : (
              <>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-email">
                邮箱
              </label>
              <input
                id="meoo-reg-email"
                className={inputClass}
                autoComplete="email"
                placeholder="用于接收验证码"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value.trim())}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meoo-reg-email-code">
                邮箱验证码
              </label>
              <div className="flex gap-2">
                <input
                  id="meoo-reg-email-code"
                  className={cn(inputClass, 'min-w-0 flex-1')}
                  inputMode="numeric"
                  placeholder="6 位验证码"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  type="button"
                  disabled={emailSending || emailCooldown > 0}
                  onClick={() => void sendEmailForRegister()}
                  className={smsBtn}
                >
                  {emailSending ? '发送中…' : emailCooldown > 0 ? `${emailCooldown}s` : '获取验证码'}
                </button>
              </div>
              {err ? (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
              ) : null}
              {infoHint ? (
                <p className="mt-2 text-sm text-cyan-800">{infoHint}</p>
              ) : null}
            </div>
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="meoo-reg-pw">
                密码
              </label>
              <SecretInput
                id="meoo-reg-pw"
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
              <SecretInput
                id="meoo-reg-pw2"
                className={inputClass}
                autoComplete="new-password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} />
            {err ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !agreed}
              className={primaryBtn}
            >
              {busy ? '注册中…' : '确认注册'}
            </button>
            <p className="text-center text-[10px] text-slate-400/80">
              auth {String(import.meta.env.VITE_AUTH_API_REVISION ?? 'legacy')}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
