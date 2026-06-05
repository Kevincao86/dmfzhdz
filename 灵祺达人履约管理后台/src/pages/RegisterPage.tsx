import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import { phoneRegister, sendRegisterSms } from '../lib/mpApi'
import { setActiveRole, setSession } from '../lib/mpSession'
import { formatMpApiErr } from '../lib/mpApiErrors'
import {
  parseWorkIdentityQuery,
  setWorkIdentity,
  workIdentityToAccountRole,
  WORK_EDITION_LABEL,
} from '../lib/mpWorkIdentity'

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : ''
}

export default function RegisterPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const workIdentity = parseWorkIdentityQuery(params.get('role'))
  const accountRole = workIdentityToAccountRole(workIdentity)

  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)

  async function onSendSms() {
    const p = normalizePhone(phone)
    if (!p) {
      setErr('请输入有效大陆手机号')
      return
    }
    setErr('')
    try {
      await sendRegisterSms(p)
      setSmsCooldown(60)
      const t = setInterval(() => {
        setSmsCooldown((c) => {
          if (c <= 1) {
            clearInterval(t)
            return 0
          }
          return c - 1
        })
      }, 1000)
    } catch (e) {
      setErr(formatMpApiErr(e, '验证码发送失败'))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = normalizePhone(phone)
    if (!p) {
      setErr('请输入有效大陆手机号')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入 6 位验证码')
      return
    }
    if (password.length < 6) {
      setErr('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      setErr('两次输入的密码不一致')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const { token, account } = await phoneRegister({
        phone: p,
        smsCode: smsCode.trim(),
        password,
        role: accountRole,
      })
      setSession(token, account)
      setWorkIdentity(workIdentity)
      setActiveRole(accountRole)
      nav('/hall', { replace: true })
    } catch (e) {
      setErr(formatMpApiErr(e, '注册失败，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 text-slate-900',
        'bg-gradient-to-b from-violet-50 via-white to-fuchsia-50/40',
      )}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-xl backdrop-blur-xl space-y-4"
      >
        <h1 className="text-xl font-bold">注册 · {WORK_EDITION_LABEL[workIdentity]}</h1>
        <p className="text-sm text-slate-500">
          手机号将作为登录账号；注册后可在「我的」自由切换达人 / 拍摄 / 剪辑 / PR
        </p>

        <label className="block text-sm">
          <span className="text-slate-600">手机号</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11 位大陆手机号"
          />
        </label>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位验证码"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-700"
            disabled={smsCooldown > 0}
            onClick={() => void onSendSms()}
          >
            {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">确认密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        {err ? <p className="text-sm text-red-600">{err}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-violet-600 py-2.5 text-white font-semibold disabled:opacity-50"
        >
          {loading ? '提交中…' : '注册并进入工作台'}
        </button>

        <p className="text-center text-sm text-slate-500">
          已有账号？{' '}
          <Link to={`/login?role=${workIdentity}`} className="text-violet-600 underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  )
}
