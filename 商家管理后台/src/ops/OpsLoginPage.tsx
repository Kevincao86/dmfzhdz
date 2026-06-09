import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import SecretInput from '../components/SecretInput'
import ThemeToggle from '../components/ThemeToggle'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import {
  isRememberLoginEnabled,
  readRememberedLogin,
  writeRememberedLogin,
} from '../lib/rememberLogin'
import {
  clearOpsSession,
  ensureOpsMasterAccount,
  firstAllowedOpsPath,
  hasOpsCloudSession,
  isOpsMasterPhone,
  migrateLocalOpsStaffToRemoteIfNeeded,
  readOpsSession,
  verifyOpsLogin,
  writeOpsSession,
} from './opsStaffAuth'

const REMEMBER_SCOPE = 'ops'

export default function OpsLoginPage() {
  const navigate = useNavigate()
  useEffect(() => {
    sessionStorage.removeItem('meoo_ops_login')
    void ensureOpsMasterAccount().then(() => {
      const session = readOpsSession()
      if (session) {
        navigate(firstAllowedOpsPath(session), { replace: true })
      }
    })
  }, [navigate])

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [rememberPassword, setRememberPassword] = useState(() => isRememberLoginEnabled(REMEMBER_SCOPE))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const saved = readRememberedLogin(REMEMBER_SCOPE)
    if (saved) {
      setAccount(saved.loginName)
      setPassword(saved.password)
      setRememberPassword(true)
    }
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    void (async () => {
      try {
        await ensureOpsMasterAccount()
        const r = await verifyOpsLogin(account, password)
        if (!r.ok) {
          const master = isOpsMasterPhone(account)
          const msg: Record<string, string> = {
            not_found: master
              ? '主账号密码错误或云端未就绪。请确认密码（默认 kaiyedaji888），或联系技术检查云端 ops_staff_accounts 表与 Supabase 环境变量。'
              : '该手机号未在云端注册。子账号须由主账号在「云端会话」下创建；请主账号用 18768501283 登录后再建号。',
            bad_password: master
              ? '主账号密码错误。若忘记密码，默认密码为 kaiyedaji888（若已改过请用新密码）。'
              : '密码错误，请重试或请主账号在「账号与权限」中重置密码。',
            bad_credentials: master
              ? '主账号密码错误。若忘记密码，默认密码为 kaiyedaji888（若已改过请用新密码）。'
              : '密码错误，请重试或请主账号在「账号与权限」中重置密码。',
            disabled: '该账号已停用，请联系主账号启用。',
            invalid_phone: '请输入 11 位手机号。',
          }
          setErr(msg[r.error] ?? '账号或密码错误')
          return
        }
        if (rememberPassword) {
          writeRememberedLogin(REMEMBER_SCOPE, { loginName: account.trim(), password })
        } else {
          writeRememberedLogin(REMEMBER_SCOPE, null)
        }
        writeOpsSession(r.session)
        if (!hasOpsCloudSession()) {
          const onProd = /mofangdianai\.com$/i.test(window.location.hostname)
          /** 仅子账号须阻断；主账号可先进入并在「账号与权限」查看云端连接状态 */
          if (onProd && r.session.role !== 'super_admin') {
            clearOpsSession()
            setErr(
              '登录未获得云端会话（缺少 sessionToken）。请确认运营台已配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 后重新部署，再由主账号创建子账号。',
            )
            return
          }
        }
        if (r.session.role === 'super_admin') {
          await migrateLocalOpsStaffToRemoteIfNeeded()
        }
        navigate(firstAllowedOpsPath(r.session), { replace: true })
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-16 w-16 rounded-xl object-contain" />
          <h1 className="mt-4 text-xl font-semibold text-white">运营管控台</h1>
          <p className="mt-2 text-sm text-slate-500">请使用授权手机号登录</p>
          <p className="mt-1 text-xs text-slate-600">主账号：18768501283（勿用旧号 81283）</p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="ops-phone">
              手机号（账号）
            </label>
            <input
              id="ops-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="11 位手机号"
              value={account}
              onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="ops-pw">
              密码
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <SecretInput
                id="ops-pw"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
              className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-500/30"
            />
            记住密码
          </label>
          {err ? <p className="text-sm text-rose-400">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
          查看{' '}
          <Link to="/legal/aup" className="text-indigo-400 hover:underline">
            软件服务及许可协议
          </Link>{' '}
          和{' '}
          <Link to="/legal/privacy" className="text-indigo-400 hover:underline">
            隐私政策
          </Link>
        </p>
        <div className="mt-6">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
