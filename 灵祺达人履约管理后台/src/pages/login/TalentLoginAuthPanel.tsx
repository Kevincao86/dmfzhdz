import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import RememberPasswordRow from '@merchant/components/login/RememberPasswordRow'
import { cn } from '../../cn'
import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { ROLE_LABEL } from '../landing/landingCopy'
import DyOAuthOfficialPanel from '@merchant/components/login/DyOAuthOfficialPanel'
import { dyOAuthBegin, scanCreate, scanPoll } from '../../lib/mpApi'
import type { MpAccount } from '../../lib/mpSession'

export type LoginTab = 'password' | 'scan'
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
}: Props) {
  const [scanChannel, setScanChannel] = useState<ScanChannel>('douyin')
  const [wxQrPayload, setWxQrPayload] = useState('')
  const [wxTicket, setWxTicket] = useState('')
  const [wxScanHint, setWxScanHint] = useState('')
  const [dyAuthorizeUrl, setDyAuthorizeUrl] = useState('')
  const [dyScanHint, setDyScanHint] = useState('')
  const [dyLoading, setDyLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void onPasswordLogin()
  }

  useEffect(() => {
    if (tab !== 'scan' || scanChannel !== 'wechat' || !SCAN_LOGIN_WECHAT_ENABLED) return
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
  }, [tab, scanChannel])

  useEffect(() => {
    if (tab !== 'scan' || scanChannel !== 'wechat' || !SCAN_LOGIN_WECHAT_ENABLED || !wxTicket) return
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
    if (tab !== 'scan' || scanChannel !== 'douyin') return
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
          const msg = e instanceof Error ? e.message : String(e)
          setDyScanHint(
            /dy_web_not_configured/i.test(msg)
              ? '抖音网站扫码尚未配置，请按 README 在抖音开放平台创建网站应用并配置轻量环境变量'
              : msg,
          )
        }
      } finally {
        if (!cancelled) setDyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, scanChannel, workIdentity])

  return (
    <div className="relative w-full">
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          当前版本 · {ROLE_LABEL[workIdentity]}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">欢迎登录</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          与达人招募小程序账号互通 · 支持微信 / 抖音扫码
        </p>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-violet-100/80 bg-violet-50/50 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <ShieldCheck className="h-5 w-5 text-violet-600" aria-hidden />
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          手机号与密码在小程序「我的信息」中设置；数据经 HTTPS 加密传输。
        </p>
      </div>

      <div className="mb-5 flex gap-6 border-b border-slate-200/80">
        {(
          [
            ['password', '账号密码'],
            ['scan', '扫码登录'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              'relative pb-3 text-sm font-semibold transition-colors',
              tab === id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            {label}
            {tab === id ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'password' ? (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="tf-login-name">
              手机号
            </label>
            <input
              id="tf-login-name"
              className={inputClass}
              autoComplete="username"
              inputMode="numeric"
              placeholder="11 位大陆手机号"
              value={loginName}
              onChange={(e) => onLoginNameChange(e.target.value.replace(/\D/g, '').slice(0, 11))}
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
          {err ? (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
          ) : null}
          <button type="submit" disabled={loading} className={primaryBtn}>
            {loading ? '登录中…' : '进入星选平台'}
          </button>
        </form>
      ) : (
        <>
          <div className="mb-4 flex gap-2 rounded-xl bg-slate-100/80 p-1">
            {(
              [
                ['wechat', '微信扫码'],
                ['douyin', '抖音扫码'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScanChannel(id)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                  scanChannel === id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {scanChannel === 'wechat' ? (
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
              <p className="text-xs leading-relaxed text-slate-400">
                需在抖音开放平台创建「网站应用」，并在轻量 auth-api 配置 MP_DOUYIN_WEB_CLIENT_KEY / MP_DOUYIN_WEB_CLIENT_SECRET
              </p>
            </div>
          )}
        </>
      )}

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
