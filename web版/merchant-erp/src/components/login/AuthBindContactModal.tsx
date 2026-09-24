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
  const [mergeCode, setMergeCode] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

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
        setMergeCode('')
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
    if (!/^\d{6}$/.test(mergeCode.trim())) {
      setErr('请输入验证码确认合并')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const r = await postAuthIdentity({
        action: 'merge_confirm',
        mergeToken: merge.mergeToken,
        smsCode: mergeCode.trim(),
      })
      if (!r.ok || !r.access_token || !r.refresh_token) {
        setErr(r.message || '合并失败')
        return
      }
      if (supabase) {
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">{merge ? '确认合并账号' : title}</h3>
        {merge ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{merge.message}</p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            微信 / 抖音登录后需绑定手机号。若该手机已注册，将提示合并为同一账号。
          </p>
        )}

        {!merge ? (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              inputMode="numeric"
              placeholder="11 位大陆手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
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
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-500">向 {merge.masked} 再发一次验证码并填写，以确认合并。</p>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                inputMode="numeric"
                placeholder="确认验证码"
                value={mergeCode}
                onChange={(e) => setMergeCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
          {onClose ? (
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
            onClick={() => void (merge ? submitMerge() : submitBind())}
          >
            {busy ? '处理中…' : merge ? '确定合并' : '绑定并继续'}
          </button>
        </div>
      </div>
    </div>
  )
}
