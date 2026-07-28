import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { verifySupportToken, writeToken } from '../lib/api'

export default function LoginPage() {
  const nav = useNavigate()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const t = token.trim()
    if (!t) {
      setError('请输入客服 HTTP Token（与轻量 MEOO_SUPPORT_OPS_HTTP_TOKEN 一致）')
      return
    }
    setBusy(true)
    setError(null)
    const ok = await verifySupportToken(t)
    setBusy(false)
    if (!ok) {
      setError('Token 无效或轻量 support-poll 不可用')
      return
    }
    writeToken(t)
    nav('/', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-2 text-sm tracking-wide text-[var(--muted)]">LINGQI SUPPORT</p>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">在线客服台</h1>
      <p className="mb-8 text-sm leading-relaxed text-[var(--muted)]">
        与运营台 /support 共用同一消息库；飞书坐席回复也会写入此处。请使用服务端客服 Token 登录。
      </p>
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <label className="block text-sm text-[var(--muted)]">
          客服 Token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-[var(--text)] outline-none focus:border-[var(--accent)]"
            placeholder="MEOO_SUPPORT_OPS_HTTP_TOKEN"
          />
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? '校验中…' : '进入工作台'}
        </button>
      </form>
    </div>
  )
}
