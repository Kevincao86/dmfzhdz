import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../cn'
import { supabase } from '../../lib/supabaseClient'
import { isCnMobileValid, postAuthIdentity, sendAuthSms } from '../../lib/tenantRegisterApi'
import { toUserFacingError } from '../../lib/userFacingError'

type MergeState = {
  mergeToken: string
  channel: 'phone' | 'email'
  message: string
  masked: string
}

type Step = 'enter' | 'code' | 'merge'

type Props = {
  open: boolean
  accessToken?: string
  title?: string
  onClose?: () => void
  onBound: () => void
}

export default function AuthBindContactModal({
  open,
  accessToken,
  title = '绑定手机号',
  onClose,
  onBound,
}: Props) {
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [merge, setMerge] = useState<MergeState | null>(null)
  const [step, setStep] = useState<Step>('enter')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (!open) {
      setStep('enter')
      setMerge(null)
      setSmsCode('')
      setErr('')
    }
  }, [open])

  const token = accessToken || ''

  const sendCode = useCallback(async () => {
    if (sending || cooldown > 0) return
    const mobile = phone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      setErr('请输入有效的 11 位手机号')
      return
    }
    setSending(true)
    setErr('')
    try {
      const r = await sendAuthSms(mobile)
      if (!r.ok) {
        setErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setCooldown(60)
      if (r.devCode) setSmsCode(r.devCode)
    } finally {
      setSending(false)
    }
  }, [phone, sending, cooldown])

  const backToEnter = () => {
    setStep('enter')
    setMerge(null)
    setSmsCode('')
    setErr('')
  }

  const probeThenBind = async () => {
    const mobile = phone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      setErr('请输入有效的 11 位手机号')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const r = await postAuthIdentity({
        action: 'probe_contact',
        phone: mobile,
        access_token: token,
      })
      if (r.error === 'account_exists_merge' && r.mergeToken) {
        setMerge({
          mergeToken: r.mergeToken,
          channel: 'phone',
          message: r.message || '已有该账号，是否确定合并？',
          masked: String(r.masked || mobile),
        })
        setSmsCode('')
        setStep('merge')
        return
      }
      if (!r.ok) {
        setErr(r.message || '检测失败')
        return
      }
      setSmsCode('')
      setStep('code')
    } finally {
      setBusy(false)
    }
  }

  const submitBind = async () => {
    const mobile = phone.replace(/\D/g, '')
    if (!isCnMobileValid(mobile)) {
      setErr('请输入有效的 11 位手机号')
      return
    }
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入 6 位验证码')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const r = await postAuthIdentity({
        action: 'bind_contact',
        phone: mobile,
        smsCode: smsCode.trim(),
        access_token: token,
      })
      if (r.error === 'account_exists_merge' && r.mergeToken) {
        setMerge({
          mergeToken: r.mergeToken,
          channel: 'phone',
          message: r.message || '已有该账号，是否确定合并？',
          masked: String(r.masked || mobile),
        })
        setSmsCode('')
        setStep('merge')
        return
      }
      if (!r.ok) {
        setErr(r.message || '绑定失败')
        return
      }
      onBound()
    } finally {
      setBusy(false)
    }
  }

  const submitMerge = async () => {
    if (!merge) return
    if (!/^\d{6}$/.test(smsCode.trim())) {
      setErr('请输入验证码确认加入')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const r = await postAuthIdentity({
        action: 'merge_confirm',
        mergeToken: merge.mergeToken,
        smsCode: smsCode.trim(),
      })
      if (!r.ok) {
        setErr(r.message || '加入失败')
        return
      }
      if (r.access_token && r.refresh_token && supabase) {
        await supabase.auth.setSession({
          access_token: r.access_token,
          refresh_token: r.refresh_token,
        })
      }
      onBound()
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const heading = step === 'merge' ? '加入已有手机号' : title
  const primaryLabel = busy
    ? '处理中…'
    : step === 'merge'
      ? '确定加入'
      : step === 'code'
        ? '确认绑定'
        : '绑定并继续'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
        {step === 'merge' && merge ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{merge.message}</p>
        ) : step === 'code' ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            该手机号尚未注册，请获取验证码后完成绑定。
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            微信 / 抖音登录后需绑定手机号。若该号已有账号，验证后把当前账号加入该号（最多 3 个）。
          </p>
        )}

        {step === 'enter' ? (
          <div className="mt-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              inputMode="numeric"
              placeholder="11 位大陆手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
          </div>
        ) : (
          <div className="mt-4">
            {step === 'merge' && merge ? (
              <p className="mb-2 text-xs text-slate-500">向 {merge.masked} 发送验证码并填写，以确认加入该号。</p>
            ) : (
              <p className="mb-2 text-xs text-slate-500">将发送至 {phone}</p>
            )}
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                inputMode="numeric"
                placeholder="6 位验证码"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="button"
                disabled={sending || cooldown > 0 || busy}
                onClick={() => void sendCode()}
                className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-medium text-cyan-700 disabled:opacity-50"
              >
                {sending ? '发送中…' : cooldown > 0 ? `${cooldown}s` : '获取验证码'}
              </button>
            </div>
          </div>
        )}

        {err ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}

        <div className="mt-5 flex gap-2">
          {step !== 'enter' ? (
            <button
              type="button"
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={backToEnter}
            >
              返回
            </button>
          ) : onClose ? (
            <button
              type="button"
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600"
              onClick={onClose}
            >
              稍后
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className={cn(
              'flex-1 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#14b8a6] py-2.5 text-sm font-semibold text-white disabled:opacity-60',
            )}
            onClick={() =>
              void (step === 'enter' ? probeThenBind() : step === 'merge' ? submitMerge() : submitBind())
            }
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
