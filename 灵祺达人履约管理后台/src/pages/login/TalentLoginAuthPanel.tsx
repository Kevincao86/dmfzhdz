import type { FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import RememberPasswordRow from '@merchant/components/login/RememberPasswordRow'
import { cn } from '../../cn'
import type { MpWorkIdentity } from '../../lib/mpWorkIdentity'
import { ROLE_LABEL } from '../landing/landingCopy'

export type LoginTab = 'password' | 'scan'

/** 微信开放平台网站应用资质就绪后改为 true */
export const SCAN_LOGIN_ENABLED = false

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
  qrPayload: string
  scanHint: string
  workIdentity: MpWorkIdentity
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
  qrPayload,
  scanHint,
  workIdentity,
  showDevPreview,
  onDevPreview,
  rememberPassword,
  onRememberPasswordChange,
}: Props) {
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void onPasswordLogin()
  }

  return (
    <div className="relative w-full">
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          当前版本 · {ROLE_LABEL[workIdentity]}
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">欢迎登录</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          与达人招募小程序账号互通 · 一微信一灵祺 ID
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
            ['scan', '微信扫码'],
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
      ) : SCAN_LOGIN_ENABLED ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-inner">
            <span className="break-all text-xs leading-snug text-slate-700">{qrPayload || '加载二维码…'}</span>
          </div>
          <p className="text-sm text-slate-500">{scanHint}</p>
          <p className="text-xs text-amber-700/90">
            接口已打通；微信开放平台网站应用资质齐全后可展示正式二维码
          </p>
        </div>
      ) : (
        <div className="space-y-4 py-8 text-center">
          <div className="mx-auto flex h-52 w-52 flex-col items-center justify-center rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-6">
            <p className="text-base font-semibold text-slate-800">正在接入中</p>
            <p className="mt-2 text-sm text-slate-500">尽情期待</p>
          </div>
          <p className="text-sm text-slate-500">微信扫码登录即将上线，请先用账号密码登录</p>
        </div>
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
