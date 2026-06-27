import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LoginLegalFooter from '@merchant/components/login/LoginLegalFooter'
import LoginPortalNav from '@merchant/components/login/LoginPortalNav'
import {
  isRememberLoginEnabled,
  readRememberedLogin,
  writeRememberedLogin,
} from '@merchant/lib/rememberLogin'
import { cn } from '../cn'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { passwordLogin } from '../lib/mpApi'
import type { MpAccount } from '../lib/mpSession'
import { enterDevPreview } from '../lib/mpSession'
import { applyWorkIdentityAfterLogin } from '../lib/switchWorkIdentity'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import {
  parseWorkIdentityQuery,
  setWorkIdentity,
  workIdentityToAccountRole,
  type MpWorkIdentity,
} from '../lib/mpWorkIdentity'
import TalentLoginAuthPanel, { type LoginTab } from './login/TalentLoginAuthPanel'

const AUTH_SHELL = cn(
  'relative w-full max-w-md rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
)

const REMEMBER_SCOPE = 'fulfillment'

function parseLoginWorkIdentity(raw: string | null): MpWorkIdentity | null {
  if (!raw) return null
  const id = parseWorkIdentityQuery(raw)
  return raw === id ? id : null
}

export default function LoginPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roleFromUrl = parseLoginWorkIdentity(params.get('role'))
  const workIdentity = roleFromUrl ?? 'talent'

  const [tab, setTab] = useState<LoginTab>('password')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(() => isRememberLoginEnabled(REMEMBER_SCOPE))

  useEffect(() => {
    const saved = readRememberedLogin(REMEMBER_SCOPE)
    if (saved) {
      setLoginName(saved.loginName)
      setPassword(saved.password)
      setRememberPassword(true)
    }
  }, [])

  useEffect(() => {
    if (!roleFromUrl) nav('/', { replace: true })
    else setWorkIdentity(roleFromUrl)
  }, [roleFromUrl, nav])

  async function onPasswordLogin() {
    setErr('')
    setLoading(true)
    try {
      const { token, account } = await passwordLogin(loginName.trim(), password)
      if (rememberPassword) {
        writeRememberedLogin(REMEMBER_SCOPE, { loginName: loginName.trim(), password })
      } else {
        writeRememberedLogin(REMEMBER_SCOPE, null)
      }
      await applyWorkIdentityAfterLogin(token, account, workIdentity)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(formatMpApiErr(e, '登录失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  async function onScanLoginSuccess(token: string, account: MpAccount) {
    await applyWorkIdentityAfterLogin(token, account, workIdentity)
    nav('/hall', { replace: true })
  }

  function onDevPreview() {
    enterDevPreview(workIdentityToAccountRole(workIdentity))
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
      <header className="absolute left-0 right-0 top-[max(0.75rem,env(safe-area-inset-top))] z-10 px-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <LoginPortalNav linkClassName="text-slate-600 hover:text-slate-900" activeClassName="text-violet-700" />
          <Link
            to="/login"
            className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            登录
          </Link>
        </div>
      </header>

      <div className="mb-6 mt-14 flex items-center gap-3">
        <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="h-11 w-11 rounded-2xl object-contain shadow-sm" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            LingQi · Talent Fulfillment
          </p>
          <h1 className="text-lg font-bold text-slate-900">灵祺星选平台</h1>
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
          workIdentity={workIdentity}
          onScanLoginSuccess={onScanLoginSuccess}
          showDevPreview={import.meta.env.DEV}
          onDevPreview={onDevPreview}
          rememberPassword={rememberPassword}
          onRememberPasswordChange={setRememberPassword}
        />
        <p className="mt-4 text-center text-sm text-slate-600">
          还没有账号？{' '}
          <Link to={`/register?role=${workIdentity}`} className="font-semibold text-violet-600 underline">
            手机号注册
          </Link>
        </p>
        <LoginLegalFooter />
      </div>
    </div>
  )
}
