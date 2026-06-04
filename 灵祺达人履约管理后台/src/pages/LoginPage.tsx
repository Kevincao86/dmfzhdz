import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '../cn'
import { passwordLogin, scanCreate, scanPoll, switchRole } from '../lib/mpApi'
import {
  enterDevPreview,
  setActiveRole,
  setLoginRolePref,
  setSession,
  type MpAccountRole,
} from '../lib/mpSession'
import TalentLoginAuthPanel, { type LoginTab } from './login/TalentLoginAuthPanel'
const AUTH_SHELL = cn(
  'relative w-full max-w-md rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
)

function parseLoginRole(raw: string | null): MpAccountRole | null {
  if (raw === 'talent' || raw === 'pr') return raw
  return null
}

async function applyRoleAfterLogin(
  token: string,
  account: import('../lib/mpSession').MpAccount,
  pref: MpAccountRole,
) {
  setSession(token, account)
  setActiveRole(pref)
  if (account.activeRole !== pref) {
    try {
      const { account: next } = await switchRole(pref)
      setSession(token, next)
      setActiveRole(pref)
    } catch {
      setActiveRole(pref)
    }
  }
}

export default function LoginPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roleFromUrl = parseLoginRole(params.get('role'))
  const loginRole = roleFromUrl ?? 'talent'

  const [tab, setTab] = useState<LoginTab>('password')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticket, setTicket] = useState('')
  const [qrPayload, setQrPayload] = useState('')
  const [scanHint, setScanHint] = useState('')

  useEffect(() => {
    if (!roleFromUrl) nav('/', { replace: true })
    else setLoginRolePref(roleFromUrl)
  }, [roleFromUrl, nav])

  useEffect(() => {
    if (tab !== 'scan' || !roleFromUrl) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await scanCreate()
        if (cancelled) return
        setTicket(s.ticket)
        setQrPayload(s.qrPayload)
        setScanHint('请使用微信扫描二维码（资质配置后自动确认）')
      } catch (e) {
        setScanHint(e instanceof Error ? e.message : '扫码初始化失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, roleFromUrl])

  useEffect(() => {
    if (!ticket || tab !== 'scan' || !roleFromUrl) return
    const t = setInterval(async () => {
      try {
        const r = await scanPoll(ticket)
        if (r.status === 'confirmed' && r.token && r.account) {
          await applyRoleAfterLogin(r.token, r.account, loginRole)
          nav('/hall', { replace: true })
        } else if (r.message) setScanHint(r.message)
      } catch (_) {}
    }, 2500)
    return () => clearInterval(t)
  }, [ticket, tab, nav, loginRole, roleFromUrl])

  async function onPasswordLogin() {
    setErr('')
    setLoading(true)
    try {
      const { token, account } = await passwordLogin(loginName.trim(), password)
      await applyRoleAfterLogin(token, account, loginRole)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  function onDevPreview() {
    enterDevPreview(loginRole)
    nav('/hall', { replace: true })
  }

  if (!roleFromUrl) return null

  return (
    <div
      className={cn(
        'relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden px-4 py-10 text-slate-900',
        'pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]',
      )}
      style={{
        background: `
          radial-gradient(ellipse 75% 55% at 12% 18%, rgba(56, 189, 248, 0.14), transparent 55%),
          radial-gradient(ellipse 65% 50% at 88% 82%, rgba(139, 92, 246, 0.12), transparent 50%),
          linear-gradient(165deg, #f8fafc 0%, #eef4ff 42%, #faf5ff 100%)
        `,
      }}
    >
      <Link
        to="/"
        className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-sm hover:text-violet-700 sm:left-8"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        返回首页
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="灵祺" className="h-11 w-11 rounded-2xl object-contain shadow-sm" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            LingQi · Talent Fulfillment
          </p>
          <h1 className="text-lg font-bold text-slate-900">灵祺达人履约管理后台</h1>
        </div>
      </div>

      <div className={AUTH_SHELL}>
        <TalentLoginAuthPanel
          tab={tab}
          onTabChange={setTab}
          loginName={loginName}
          onLoginNameChange={setLoginName}
          password={password}
          onPasswordChange={setPassword}
          err={err}
          loading={loading}
          onPasswordLogin={onPasswordLogin}
          qrPayload={qrPayload}
          scanHint={scanHint}
          loginRole={loginRole}
          showDevPreview={import.meta.env.DEV}
          onDevPreview={onDevPreview}
        />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          登录即表示同意平台服务条款 · 与达人招募小程序账号体系互通
        </p>
      </div>
    </div>
  )
}
