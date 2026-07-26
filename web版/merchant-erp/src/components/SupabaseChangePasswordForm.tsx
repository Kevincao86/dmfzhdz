import { KeyRound, Loader2 } from 'lucide-react'
import SecretInput from './SecretInput'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { sendAuthSms } from '../lib/tenantRegisterApi'
import { phoneFromAuthUser } from '../lib/tenantLocalState'
import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { toUserFacingError } from '../lib/userFacingError'

/**
 * 商家/服务商主账号：手机号 + 短信验证码修改登录密码。
 * 入口：头像 → 修改密码。
 */
export default function SupabaseChangePasswordForm() {
  const rid = useId()
  const [accountHint, setAccountHint] = useState('')
  const [boundPhone, setBoundPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const smsInflightRef = useRef(false)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata as { login_name?: string; phone?: string } | undefined
      const name = meta?.login_name?.trim()
      const mobile = phoneFromAuthUser({ phone: u.phone, user_metadata: meta })
      setBoundPhone(mobile)
      setPhone(mobile)
      setAccountHint(name ? `账户名：${name}` : u.email ? `登录邮箱：${u.email}` : '')
    })
  }, [])

  useEffect(() => {
    if (smsCooldown <= 0) return
    const t = window.setTimeout(() => setSmsCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [smsCooldown])

  if (!supabaseConfigured || !supabase) return null

  const phoneId = `${rid}-phone`
  const smsId = `${rid}-sms`
  const newId = `${rid}-new`
  const cnfId = `${rid}-confirm`

  const onSendSms = async () => {
    if (smsInflightRef.current || smsSending || smsCooldown > 0) return
    setErr(null)
    setOk(null)
    const mobile = phone.replace(/\D/g, '').replace(/^86/, '')
    if (!/^1\d{10}$/.test(mobile)) {
      setErr('请输入有效大陆手机号')
      return
    }
    if (boundPhone && mobile !== boundPhone) {
      setErr('手机号须与当前登录账号一致')
      return
    }
    smsInflightRef.current = true
    setSmsSending(true)
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        setErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setSmsCooldown(60)
      if (r.devCode) {
        setSmsCode(r.devCode)
        setOk(`开发环境验证码：${r.devCode}（已自动填入）`)
      } else {
        setOk(r.message ?? '验证码已发送')
      }
    } finally {
      setSmsSending(false)
      smsInflightRef.current = false
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setOk(null)

    const mobile = phone.replace(/\D/g, '').replace(/^86/, '')
    if (!/^1\d{10}$/.test(mobile)) {
      setErr('请输入有效大陆手机号')
      return
    }
    if (boundPhone && mobile !== boundPhone) {
      setErr('手机号须与当前登录账号一致')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入 6 位验证码')
      return
    }
    if (newPassword.length < 6) {
      setErr('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setErr('两次输入的新密码不一致')
      return
    }

    const client = supabase
    if (!client) return
    setBusy(true)
    try {
      const { data: sess } = await client.auth.getSession()
      const token = sess.session?.access_token
      if (!token) {
        setErr('登录已失效，请重新登录后再改密')
        return
      }

      const targets = merchantErpApiCandidates('/api/meoo-auth-sms-change-password')
      let lastErr = '改密失败'
      for (const url of targets) {
        let res: Response
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              phone: mobile,
              smsCode: smsCode.trim(),
              newPassword,
            }),
          })
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
          continue
        }
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          message?: string
          error?: string
        }
        if (res.ok && json.ok) {
          setOk(json.message || '密码已更新，下次登录请使用新密码')
          setSmsCode('')
          setNewPassword('')
          setConfirmPassword('')
          return
        }
        lastErr = json.message || json.error || `HTTP ${res.status}`
        if (res.status === 404 || res.status >= 502) continue
        break
      }
      setErr(lastErr)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-indigo-100">
          <KeyRound className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">修改登录密码</h3>
          <p className="mt-1 text-sm text-gray-600">
            使用绑定手机号收取验证码后设置新密码。
            {accountHint ? (
              <>
                {' '}
                <span className="font-medium text-gray-800">{accountHint}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <form className="mx-auto max-w-md space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={phoneId}>
            手机号
          </label>
          <input
            id={phoneId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/25 focus:ring-2"
            placeholder="须与当前登录账号手机号一致"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={smsId}>
            验证码
          </label>
          <div className="flex gap-2">
            <input
              id={smsId}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/25 focus:ring-2"
              placeholder="6 位验证码"
            />
            <button
              type="button"
              disabled={smsSending || smsCooldown > 0 || busy}
              onClick={() => void onSendSms()}
              className="shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              {smsSending ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={newId}>
            新密码
          </label>
          <SecretInput
            id={newId}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/25 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={cnfId}>
            确认新密码
          </label>
          <SecretInput
            id={cnfId}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/25 focus:ring-2"
          />
        </div>

        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          保存新密码
        </button>
      </form>
    </div>
  )
}
