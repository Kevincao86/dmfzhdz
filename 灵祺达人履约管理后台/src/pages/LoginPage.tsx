import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordLogin, scanCreate, scanPoll } from '../lib/mpApi'
import { setSession } from '../lib/mpSession'

type Tab = 'password' | 'scan'

export default function LoginPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('password')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [ticket, setTicket] = useState('')
  const [qrPayload, setQrPayload] = useState('')
  const [scanHint, setScanHint] = useState('')

  useEffect(() => {
    if (tab !== 'scan') return
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
  }, [tab])

  useEffect(() => {
    if (!ticket || tab !== 'scan') return
    const t = setInterval(async () => {
      try {
        const r = await scanPoll(ticket)
        if (r.status === 'confirmed' && r.token && r.account) {
          setSession(r.token, r.account)
          nav('/hall', { replace: true })
        } else if (r.message) setScanHint(r.message)
      } catch (_) {}
    }, 2500)
    return () => clearInterval(t)
  }, [ticket, tab, nav])

  async function onPasswordLogin() {
    setErr('')
    setLoading(true)
    try {
      const { token, account } = await passwordLogin(loginName.trim(), password)
      setSession(token, account)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#141422] to-[#0a0a10]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a28] p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-center mb-1">灵祺达人履约管理后台</h1>
        <p className="text-center text-sm text-slate-400 mb-6">与达人招募小程序账号互通 · 一微信一账号</p>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'password' ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}
            onClick={() => setTab('password')}
          >
            账号密码
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === 'scan' ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}
            onClick={() => setTab('scan')}
          >
            微信扫码
          </button>
        </div>

        {tab === 'password' ? (
          <div className="space-y-4">
            <input
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm"
              placeholder="登录名（与小程序/Web 共用）"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
            />
            <input
              type="password"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {err ? <p className="text-sm text-red-400">{err}</p> : null}
            <button
              type="button"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-orange-500 font-semibold disabled:opacity-60"
              onClick={() => void onPasswordLogin()}
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="mx-auto w-48 h-48 rounded-xl bg-white flex items-center justify-center p-3">
              <span className="text-xs text-slate-800 break-all leading-tight">{qrPayload || '加载二维码…'}</span>
            </div>
            <p className="text-xs text-slate-400">{scanHint}</p>
            <p className="text-xs text-amber-500/90">接口已打通；微信开放平台网站应用资质齐全后可展示正式二维码</p>
          </div>
        )}
      </div>
    </div>
  )
}
