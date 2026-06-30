import { useEffect, useState } from 'react'
import { OPS_MASTER_PHONE } from '../opsStaffAuth'
import { sendOpsDeleteConfirmSms } from '../opsDeleteSmsApi'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onClose: () => void
  onConfirm: (deleteSmsCode: string) => void | Promise<void>
}

export default function OpsDeleteSmsConfirmModal({
  open,
  title,
  description,
  confirmLabel = '确认删除',
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [code, setCode] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [sendErr, setSendErr] = useState('')
  const [devCode, setDevCode] = useState('')

  useEffect(() => {
    if (!open) {
      setCode('')
      setSendMsg('')
      setSendErr('')
      setDevCode('')
      setSendBusy(false)
    }
  }, [open])

  if (!open) return null

  const onSend = async () => {
    setSendBusy(true)
    setSendErr('')
    setSendMsg('')
    setDevCode('')
    try {
      const r = await sendOpsDeleteConfirmSms()
      if (!r.ok) {
        setSendErr(r.message ?? r.error ?? '发送失败')
        return
      }
      setSendMsg(r.message ?? `验证码已发送至 ${OPS_MASTER_PHONE}`)
      if (r.devCode) setDevCode(r.devCode)
    } finally {
      setSendBusy(false)
    }
  }

  const submit = () => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) {
      setSendErr('请输入 6 位短信验证码')
      return
    }
    void onConfirm(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-red-900/50 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-red-300">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm text-slate-300">{description}</p>
        <p className="mt-3 text-xs text-slate-500">
          须超级管理员手机 <span className="font-mono text-slate-400">{OPS_MASTER_PHONE}</span>{' '}
          短信验证码确认后方可删除。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sendBusy || busy}
            onClick={() => void onSend()}
            className="rounded-lg border border-indigo-700 bg-indigo-950/40 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-950 disabled:opacity-50"
          >
            {sendBusy ? '发送中…' : '发送验证码'}
          </button>
          {sendMsg ? <span className="text-xs text-emerald-400">{sendMsg}</span> : null}
        </div>
        {devCode ? (
          <p className="mt-2 text-xs text-amber-400">开发环境验证码：{devCode}</p>
        ) : null}

        <div className="mt-4">
          <label className="mb-1 block text-xs text-slate-400">短信验证码</label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              setSendErr('')
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono tracking-widest text-slate-100"
            placeholder="6 位验证码"
          />
        </div>
        {sendErr ? <p className="mt-2 text-xs text-red-400">{sendErr}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy || code.trim().length !== 6}
            onClick={submit}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
