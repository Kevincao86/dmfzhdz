import { KeyRound, Loader2 } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/**
 * 商家主账号（Supabase）自助修改登录密码；入口：头像 → 个人设置。
 */
export default function SupabaseChangePasswordForm() {
  const rid = useId()
  const [accountHint, setAccountHint] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata as { login_name?: string } | undefined
      const name = meta?.login_name?.trim()
      setAccountHint(name ? `账户名：${name}` : u.email ? `登录邮箱：${u.email}` : '')
    })
  }, [])

  if (!supabaseConfigured || !supabase) return null

  const curId = `${rid}-current`
  const newId = `${rid}-new`
  const cnfId = `${rid}-confirm`

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setOk(null)

    if (currentPassword.length < 6) {
      setErr('请输入当前密码（至少 6 位）')
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
    if (newPassword === currentPassword) {
      setErr('新密码不能与当前密码相同')
      return
    }

    const client = supabase
    if (!client) return
    setBusy(true)
    try {
      const { data: userData } = await client.auth.getUser()
      const email = userData.user?.email
      if (!email) {
        setErr('无法读取登录邮箱，请重新登录后再试')
        return
      }

      const verify = await client.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verify.error) {
        setErr('当前密码不正确')
        return
      }

      const { error: upd } = await client.auth.updateUser({ password: newPassword })
      if (upd) {
        setErr(upd.message)
        return
      }

      setOk('密码已更新，下次登录请使用新密码')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
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
          <h3 className="text-base font-semibold text-gray-900">主账号登录密码</h3>
          <p className="mt-1 text-sm text-gray-600">
            用于登录本 ERP 的主账号密码（云端）。
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
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={curId}>
            当前密码
          </label>
          <input
            id={curId}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/25 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={newId}>
            新密码
          </label>
          <input
            id={newId}
            type="password"
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
          <input
            id={cnfId}
            type="password"
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
