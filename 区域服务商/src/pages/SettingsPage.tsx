import { useEffect, useState } from 'react'
import { changeOwnPassword, fetchMe, readSession, type RegionalPartner } from '../lib/api'

export default function SettingsPage() {
  const session = readSession()
  const [partner, setPartner] = useState<RegionalPartner | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [pwdErr, setPwdErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchMe().then((r) => {
      if (!r.ok) {
        setErr(r.error)
        return
      }
      setPartner(r.data.partner)
    })
  }, [])

  const submitPassword = async () => {
    setPwdMsg(null)
    setPwdErr(null)
    if (newPassword.length < 6) {
      setPwdErr('新密码至少 6 位')
      return
    }
    if (newPassword !== newPassword2) {
      setPwdErr('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      const r = await changeOwnPassword(oldPassword, newPassword)
      if (!r.ok) {
        setPwdErr(r.error)
        return
      }
      setOldPassword('')
      setNewPassword('')
      setNewPassword2('')
      setPwdMsg('密码已更新，下次请用新密码登录')
    } finally {
      setBusy(false)
    }
  }

  const p = partner
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">账号资料</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          权限、城市与分成由平台运营台配置；此处可修改自己的登录密码
        </p>
      </div>
      {err ? <p className="text-sm text-rose-400">{err}</p> : null}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 text-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[var(--muted)]">公司</dt>
            <dd className="mt-1 text-white">{p?.companyName || session?.companyName || '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">登录手机</dt>
            <dd className="mt-1 font-mono text-white">{p?.phone || session?.phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">城市范围</dt>
            <dd className="mt-1 text-white">
              {(p?.cities ?? session?.cities ?? []).map((c) => c.city).join('、') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">分成比例</dt>
            <dd className="mt-1 text-white">
              代理 {(((p?.partnerShareRate ?? session?.partnerShareRate) ?? 0) * 100).toFixed(1)}% ·
              平台 {(((p?.platformShareRate ?? session?.platformShareRate) ?? 0) * 100).toFixed(1)}%
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--muted)]">模块权限</dt>
            <dd className="mt-1 text-white">
              {(p?.permissions ?? session?.permissions ?? []).join('、') || '—'}
            </dd>
          </div>
          {p?.note ? (
            <div className="sm:col-span-2">
              <dt className="text-[var(--muted)]">备注</dt>
              <dd className="mt-1 text-white">{p.note}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="text-sm font-semibold text-white">修改登录密码</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">忘记密码时请联系运营台在「区域服务商」列表重置</p>
        {pwdErr ? <p className="mt-2 text-xs text-rose-400">{pwdErr}</p> : null}
        {pwdMsg ? <p className="mt-2 text-xs text-emerald-400">{pwdMsg}</p> : null}
        <div className="mt-4 grid max-w-md gap-3">
          <label className="text-xs text-[var(--muted)]">
            原密码
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            新密码（至少 6 位）
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            确认新密码
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[#0b1220] px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            disabled={busy || !oldPassword || !newPassword}
            onClick={() => void submitPassword()}
            className="mt-1 w-fit rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? '提交中…' : '更新密码'}
          </button>
        </div>
      </div>
    </div>
  )
}
