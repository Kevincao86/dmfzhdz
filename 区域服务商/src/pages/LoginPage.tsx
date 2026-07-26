import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { login, readSession } from '../lib/api'

export default function LoginPage() {
  const existing = readSession()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (existing?.sessionToken) return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await login(phone, password)
      if (!r.ok) {
        setErr(r.error === 'bad_password' || r.error === '账号或密码错误' ? '账号或密码错误' : r.error)
        return
      }
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8 shadow-2xl shadow-black/30"
      >
        <p className="font-[DM_Sans] text-2xl font-bold text-white">灵祺区域服务商</p>
        <p className="mt-2 text-sm text-[var(--muted)]">城市代理门户 · 账号由平台运营台开通</p>
        <label className="mt-8 block text-xs text-[var(--muted)]">手机号</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
          placeholder="11 位手机号"
          autoComplete="username"
        />
        <label className="mt-4 block text-xs text-[var(--muted)]">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
          placeholder="登录密码"
          autoComplete="current-password"
        />
        {err ? <p className="mt-3 text-xs text-rose-400">{err}</p> : null}
        <button
          type="submit"
          disabled={busy || phone.length !== 11 || password.length < 6}
          className="mt-6 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
