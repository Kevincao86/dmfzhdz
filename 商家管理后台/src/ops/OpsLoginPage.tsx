import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import SecretInput from '../components/SecretInput'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import {
  ensureOpsMasterAccount,
  firstAllowedOpsPath,
  migrateLocalOpsStaffToRemoteIfNeeded,
  readOpsSession,
  verifyOpsLogin,
  writeOpsSession,
} from './opsStaffAuth'

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
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    void (async () => {
      try {
        await ensureOpsMasterAccount()
        const r = await verifyOpsLogin(account, password)
        if (!r.ok) {
          setErr('账号或密码错误')
          return
        }
        writeOpsSession(r.session)
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
          {err ? <p className="text-sm text-rose-400">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
