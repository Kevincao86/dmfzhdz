import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import RememberPasswordRow from '@merchant/components/login/RememberPasswordRow'
import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { ROLE_LABEL } from '../landing/landingCopy'
import DyOAuthOfficialPanel from '@merchant/components/login/DyOAuthOfficialPanel'
import LoginAltMethods from '@merchant/components/login/LoginAltMethods'
import LoginAltMethodsAgreeRow, { LOGIN_AGREE_REQUIRED } from '@merchant/components/login/LoginAltMethodsAgreeRow'
import { formatMpApiErr } from '../../lib/mpApiErrors'
import {
  bindEmailLogin,
  bindPhoneSms,
  dyOAuthBegin,
  emailLogin,
  emailRegister,
  phoneRegister,
  scanCreate,
  scanPoll,
  sendEmailCode,
  sendRegisterSms,
  smsLogin,
} from '../../lib/mpApi'
import { workIdentityToAccountRole } from '../../lib/mpWorkIdentity'
import type { MpAccount } from '../../lib/mpSession'

export type LoginTab = 'password' | 'sms' | 'email' | 'scan' | 'register'
export type ScanChannel = 'wechat' | 'douyin'

/** 微信开放平台网站应用资质就绪后改为 true */
export const SCAN_LOGIN_WECHAT_ENABLED = false

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/90 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-500/15 sm:text-sm'

const primaryBtn =
  'w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_-8px_rgba(99,102,241,0.55)] transition hover:shadow-[0_14px_32px_-8px_rgba(99,102,241,0.6)] disabled:opacity-60'

type Props = {
  tab: LoginTab
  onTabChange: (tab: LoginTab) => void
  loginName: string
  onLoginNameChange: (v: string) => void
  password: string
  onPasswordChange: (v: string) => void
  err: string
  loading: boolean
  onPasswordLogin: () => void | Promise<void>
  workIdentity: MpWorkIdentity
  onScanLoginSuccess: (token: string, account: MpAccount) => void | Promise<void>
  showDevPreview?: boolean
  onDevPreview?: () => void
  rememberPassword?: boolean
  onRememberPasswordChange?: (v: boolean) => void
  bindPending?: boolean
}

export default function TalentLoginAuthPanel({
  tab,
  onTabChange,
  loginName,
  onLoginNameChange,
  password,
  onPasswordChange,
  err,
  loading,
  onPasswordLogin,
  workIdentity,
  onScanLoginSuccess,
  showDevPreview,
  onDevPreview,
  rememberPassword,
  onRememberPasswordChange,
  bindPending,
}: Props) {
  const [scanChannel, setScanChannel] = useState<ScanChannel>('douyin')
  const [wxQrPayload, setWxQrPayload] = useState('')
  const [wxTicket, setWxTicket] = useState('')
  const [wxScanHint, setWxScanHint] = useState('')
  const [dyAuthorizeUrl, setDyAuthorizeUrl] = useState('')
  const [dyScanHint, setDyScanHint] = useState('')
  const [dyLoading, setDyLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [agreeNeed, setAgreeNeed] = useState(false)
  const [smsPhone, setSmsPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsWait, setSmsWait] = useState(0)
  const [mail, setMail] = useState('')
  const [mailCode, setMailCode] = useState('')
  const [mailWait, setMailWait] = useState(0)
  const [regPassword, setRegPassword] = useState('')
  const [regChannel, setRegChannel] = useState<'phone' | 'email'>('phone')
  const [bindKind, setBindKind] = useState<'phone' | 'email'>('phone')
  const [bindOpen, setBindOpen] = useState(Boolean(bindPending))
  const [localErr, setLocalErr] = useState('')
  const [info, setInfo] = useState('')

  const role = workIdentityToAccountRole(workIdentity)
  const showErr = localErr || err

  useEffect(() => {
    if (smsWait <= 0) return
    const t = window.setTimeout(() => setSmsWait((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [smsWait])

  useEffect(() => {
    if (mailWait <= 0) return
    const t = window.setTimeout(() => setMailWait((n) => n - 1), 1000)
    return () => window.clearTimeout(t)
  }, [mailWait])

  async function finish(token: string, account: MpAccount) {
    if (account.needsPhoneBind) {
      setBindOpen(true)
      setInfo('微信 / 抖音已登录。请绑定手机号或邮箱，之后以该号码为准。')
      await onScanLoginSuccess(token, account)
      return
    }
    setBindOpen(false)
    await onScanLoginSuccess(token, account)
  }

  async function sendSms() {
    const phone = smsPhone.replace(/\D/g, '')
    if (!/^1\d{10}$/.test(phone)) {
      setLocalErr('请输入有效的 11 位手机号')
      return
    }
    setLocalErr('')
    try {
      const r = await sendRegisterSms(phone)
      setSmsWait(60)
      const dev = r && typeof r === 'object' && 'devCode' in r ? String(r.devCode || '') : ''
      if (dev) {
        setSmsCode(dev)
        setInfo(`开发环境验证码：${dev}`)
      } else setInfo('验证码已发送')
    } catch (e) {
      setLocalErr(formatMpApiErr(e, '验证码发送失败'))
    }
  }

  async function sendMail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim())) {
      setLocalErr('请输入有效邮箱')
      return
    }
    setLocalErr('')
    try {
      const r = await sendEmailCode(mail.trim())
      setMailWait(60)
      const dev = r && typeof r === 'object' && 'devCode' in r ? String(r.devCode || '') : ''
      if (dev) {
        setMailCode(dev)
        setInfo(`开发环境验证码：${dev}`)
      } else setInfo(String((r as { message?: string }).message || '验证码已发送至邮箱'))
    } catch (e) {
      setLocalErr(formatMpApiErr(e, '邮箱验证码发送失败'))
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!agreed) return
    void onPasswordLogin()
  }

  useEffect(() => {
    if (tab !== 'scan' || !agreed || scanChannel !== 'wechat' || !SCAN_LOGIN_WECHAT_ENABLED) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await scanCreate()
        if (cancelled) return
        setWxTicket(s.ticket)
        setWxQrPayload(s.qrPayload)
        setWxScanHint('请使用微信扫描二维码（资质配置后自动确认）')
      } catch (e) {
        setWxScanHint(e instanceof Error ? e.message : '扫码初始化失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, scanChannel, agreed])

  useEffect(() => {
    if (tab !== 'scan' || !agreed || scanChannel !== 'wechat' || !SCAN_LOGIN_WECHAT_ENABLED || !wxTicket) return
    const t = setInterval(async () => {
      try {
        const r = await scanPoll(wxTicket)
        if (r.status === 'confirmed' && r.token && r.account) {
          await onScanLoginSuccess(r.token, r.account)
        } else if (r.message) setWxScanHint(r.message)
      } catch (_) {}
    }, 2500)
    return () => clearInterval(t)
  }, [wxTicket, tab, scanChannel, onScanLoginSuccess])

  useEffect(() => {
    if (tab !== 'scan' || !agreed || scanChannel !== 'douyin') return
    let cancelled = false
    setDyLoading(true)
    setDyScanHint('')
    setDyAuthorizeUrl('')
    ;(async () => {
      try {
        const s = await dyOAuthBegin(workIdentity)
        if (cancelled) return
        setDyAuthorizeUrl(s.authorizeUrl)
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e)
          setDyScanHint(
            /dy_web_not_configured/i.test(raw)
              ? '抖音网站扫码尚未配置，请联系管理员在轻量配置 MP_DOUYIN_WEB_* 环境变量'
              : formatMpApiErr(e, '扫码登录失败，请刷新后重试'),
          )
        }
      } finally {
        if (!cancelled) setDyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, scanChannel, workIdentity, agreed])

  return (
    <div className="relative w-full">
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          当前版本 · {ROLE_LABEL[workIdentity]}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">欢迎登录</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          与达人招募小程序账号互通 · 支持手机验证码、邮箱、微信、抖音
        </p>
        <div className="mt-4 flex gap-6 border-b border-slate-200">
          <button
            type="button"
            className={`pb-2 text-sm font-semibold ${tab === 'register' ? 'text-slate-400' : 'text-slate-900'}`}
            onClick={() => onTabChange('password')}
          >
            登录
          </button>
          <button
            type="button"
            className={`pb-2 text-sm font-semibold ${tab === 'register' ? 'text-slate-900' : 'text-slate-400'}`}
            onClick={() => onTabChange('register')}
          >
            注册
          </button>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-violet-100/80 bg-violet-50/50 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          手机号与密码在小程序「我的信息」中设置；数据经 HTTPS 加密传输。
        </p>
      </div>

      {info ? <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">{info}</p> : null}

      {bindOpen ? (
        <form
          className="mb-4 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!agreed) return
            setLocalErr('')
            try {
              const r =
                bindKind === 'phone'
                  ? await bindPhoneSms(smsPhone, smsCode, scanChannel === 'douyin' ? 'dy' : 'wx')
                  : await bindEmailLogin(mail, mailCode, scanChannel === 'douyin' ? 'dy' : 'wx')
              setBindOpen(false)
              await onScanLoginSuccess(r.token, r.account)
            } catch (ex) {
              setLocalErr(formatMpApiErr(ex, '绑定失败'))
            }
          }}
        >
          <p className="text-sm font-semibold text-slate-800">绑定手机号或邮箱</p>
          <p className="text-xs leading-relaxed text-slate-500">
            同一手机号或邮箱下的微信、抖音会并成一个账号，之后以该号码登录。
          </p>
          <div className="flex gap-2">
            <button type="button" className={bindKind === 'phone' ? 'text-sm font-semibold text-violet-700' : 'text-sm text-slate-500'} onClick={() => setBindKind('phone')}>手机号</button>
            <button type="button" className={bindKind === 'email' ? 'text-sm font-semibold text-violet-700' : 'text-sm text-slate-500'} onClick={() => setBindKind('email')}>邮箱</button>
          </div>
          {bindKind === 'phone' ? (
            <>
              <input className={inputClass} placeholder="11 位大陆手机号" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
              <div className="flex gap-2">
                <input className={inputClass} placeholder="6 位验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={smsWait > 0} onClick={() => void sendSms()}>{smsWait > 0 ? `${smsWait}s` : '获取验证码'}</button>
              </div>
            </>
          ) : (
            <>
              <input className={inputClass} placeholder="邮箱" value={mail} onChange={(e) => setMail(e.target.value.trim())} />
              <div className="flex gap-2">
                <input className={inputClass} placeholder="6 位验证码" value={mailCode} onChange={(e) => setMailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={mailWait > 0} onClick={() => void sendMail()}>{mailWait > 0 ? `${mailWait}s` : '获取验证码'}</button>
              </div>
            </>
          )}
          {showErr ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{showErr}</p> : null}
          <button type="submit" disabled={!agreed} className={primaryBtn}>绑定并进入</button>
        </form>
      ) : null}

      {tab === 'sms' || tab === 'email' || tab === 'scan' ? (
        <button
          type="button"
          className="mb-4 text-sm font-medium text-violet-700 hover:underline"
          onClick={() => onTabChange('password')}
        >
          ← 账号密码登录
        </button>
      ) : null}

      {tab === 'password' ? (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="tf-login-name">
              手机号 / 邮箱
            </label>
            <input
              id="tf-login-name"
              className={inputClass}
              autoComplete="username"
              placeholder="绑定的手机号或邮箱"
              value={loginName}
              onChange={(e) => onLoginNameChange(e.target.value.trim().slice(0, 64))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="tf-login-pw">
              密码
            </label>
            <input
              id="tf-login-pw"
              type="password"
              className={inputClass}
              autoComplete="current-password"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
            />
          </div>
          {typeof rememberPassword === 'boolean' && onRememberPasswordChange ? (
            <RememberPasswordRow
              checked={rememberPassword}
              onChange={onRememberPasswordChange}
              className="flex items-center gap-2 text-sm text-slate-600"
            />
          ) : null}
          <LoginAltMethodsAgreeRow
            checked={agreed}
            onChange={(v) => {
              setAgreed(v)
              if (v) setAgreeNeed(false)
            }}
          />
          {showErr ? (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-100">{showErr}</p>
          ) : null}
          <button type="submit" disabled={loading || !agreed} className={primaryBtn}>
            {loading ? '登录中…' : '进入星选平台'}
          </button>
        </form>
      ) : tab === 'sms' ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!agreed) return
            setLocalErr('')
            try {
              const r = await smsLogin(smsPhone, smsCode)
              await finish(r.token, r.account)
            } catch (ex) {
              setLocalErr(formatMpApiErr(ex, '验证码登录失败'))
            }
          }}
        >
          <input className={inputClass} placeholder="11 位大陆手机号" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
          <div className="flex gap-2">
            <input className={inputClass} placeholder="6 位短信验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={smsWait > 0} onClick={() => void sendSms()}>{smsWait > 0 ? `${smsWait}s` : '获取验证码'}</button>
          </div>
          {showErr ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{showErr}</p> : null}
          <button type="submit" disabled={!agreed} className={primaryBtn}>验证码登录</button>
        </form>
      ) : tab === 'email' ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!agreed) return
            setLocalErr('')
            try {
              const r = await emailLogin(mail, mailCode)
              await finish(r.token, r.account)
            } catch (ex) {
              setLocalErr(formatMpApiErr(ex, '邮箱登录失败'))
            }
          }}
        >
          <input className={inputClass} placeholder="注册时绑定的邮箱" value={mail} onChange={(e) => setMail(e.target.value.trim())} />
          <div className="flex gap-2">
            <input className={inputClass} placeholder="6 位邮箱验证码" value={mailCode} onChange={(e) => setMailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={mailWait > 0} onClick={() => void sendMail()}>{mailWait > 0 ? `${mailWait}s` : '获取验证码'}</button>
          </div>
          {showErr ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{showErr}</p> : null}
          <button type="submit" disabled={!agreed} className={primaryBtn}>验证码登录</button>
        </form>
      ) : tab === 'register' ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!agreed) return
            if (regPassword.length < 6) {
              setLocalErr('密码至少 6 位')
              return
            }
            setLocalErr('')
            try {
              const r =
                regChannel === 'phone'
                  ? await phoneRegister({ phone: smsPhone, smsCode, password: regPassword, role })
                  : await emailRegister({ email: mail, emailCode: mailCode, password: regPassword, role })
              await finish(r.token, r.account)
            } catch (ex) {
              setLocalErr(formatMpApiErr(ex, '注册失败'))
            }
          }}
        >
          <div className="flex gap-3 text-sm">
            <button type="button" className={regChannel === 'phone' ? 'font-semibold text-violet-700' : 'text-slate-500'} onClick={() => setRegChannel('phone')}>手机号注册</button>
            <button type="button" className={regChannel === 'email' ? 'font-semibold text-violet-700' : 'text-slate-500'} onClick={() => setRegChannel('email')}>邮箱注册</button>
          </div>
          {regChannel === 'phone' ? (
            <>
              <input className={inputClass} placeholder="11 位大陆手机号" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} />
              <div className="flex gap-2">
                <input className={inputClass} placeholder="6 位验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={smsWait > 0} onClick={() => void sendSms()}>{smsWait > 0 ? `${smsWait}s` : '获取验证码'}</button>
              </div>
            </>
          ) : (
            <>
              <input className={inputClass} placeholder="邮箱" value={mail} onChange={(e) => setMail(e.target.value.trim())} />
              <div className="flex gap-2">
                <input className={inputClass} placeholder="6 位验证码" value={mailCode} onChange={(e) => setMailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="button" className="shrink-0 rounded-xl border px-3 text-sm" disabled={mailWait > 0} onClick={() => void sendMail()}>{mailWait > 0 ? `${mailWait}s` : '获取验证码'}</button>
              </div>
            </>
          )}
          <input className={inputClass} type="password" placeholder="密码至少 6 位" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
          <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} />
          {showErr ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{showErr}</p> : null}
          <button type="submit" disabled={!agreed} className={primaryBtn}>注册并进入</button>
        </form>
      ) : (
        <>
          <LoginAltMethodsAgreeRow checked={agreed} onChange={setAgreed} className="mb-4" />
          {!agreed ? (
            <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
              {LOGIN_AGREE_REQUIRED}
            </p>
          ) : scanChannel === 'wechat' ? (
            SCAN_LOGIN_WECHAT_ENABLED ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-inner">
                  <span className="break-all text-xs leading-snug text-slate-700">
                    {wxQrPayload || '加载二维码…'}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{wxScanHint}</p>
                <p className="text-xs text-amber-700/90">
                  接口已打通；微信开放平台网站应用资质齐全后可展示正式二维码
                </p>
              </div>
            ) : (
              <div className="space-y-4 py-4 text-center">
                <div className="mx-auto flex h-52 w-52 flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6">
                  <p className="text-base font-semibold text-slate-800">微信扫码接入中</p>
                  <p className="mt-2 text-sm text-slate-500">微信开放平台网站应用审核通过后启用</p>
                </div>
                <p className="text-sm text-slate-500">请先用账号密码登录，或切换「抖音扫码」</p>
              </div>
            )
          ) : dyLoading ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-sm text-slate-500">正在加载抖音授权页…</p>
            </div>
          ) : dyAuthorizeUrl ? (
            <DyOAuthOfficialPanel authorizeUrl={dyAuthorizeUrl} />
          ) : (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm leading-relaxed text-slate-600">{dyScanHint || '无法加载抖音扫码登录'}</p>
              {/尚未配置|MP_DOUYIN_WEB/i.test(dyScanHint) ? (
                <p className="text-xs leading-relaxed text-slate-400">
                  需在抖音开放平台创建「网站应用」，并在轻量 auth-api 配置 MP_DOUYIN_WEB_CLIENT_KEY /
                  MP_DOUYIN_WEB_CLIENT_SECRET
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-400">请刷新页面重试；若持续失败请联系客服</p>
              )}
            </div>
          )}
        </>
      )}

      <LoginAltMethods
        activeId={tab === 'scan' ? scanChannel : tab === 'sms' || tab === 'email' ? tab : undefined}
        onSelect={(id) => {
          if (!agreed) {
            setAgreeNeed(true)
            return
          }
          setAgreeNeed(false)
          setLocalErr('')
          if (id === 'sms' || id === 'email') {
            onTabChange(id)
            return
          }
          if (id === 'douyin') {
            setScanChannel('douyin')
            onTabChange('scan')
            return
          }
          if (id === 'wechat') {
            setScanChannel('wechat')
            onTabChange('scan')
          }
        }}
        methods={[
          { id: 'sms', label: '短信验证码' },
          { id: 'email', label: '邮箱登录' },
          { id: 'douyin', label: '抖音登录' },
          {
            id: 'wechat',
            label: '微信登录',
            hint: '微信开放平台网站应用审核通过后启用',
          },
        ]}
      />
      {agreeNeed && !agreed ? (
        <p className="mt-2 text-center text-xs text-amber-700">{LOGIN_AGREE_REQUIRED}</p>
      ) : null}

      {showDevPreview && onDevPreview ? (
        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-violet-400 hover:text-violet-700"
          onClick={onDevPreview}
        >
          开发预览：直接进入（{ROLE_LABEL[workIdentity]}）
        </button>
      ) : null}
    </div>
  )
}
