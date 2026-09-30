import { useEffect, useState } from 'react'
import {
  bindEmailLogin,
  bindPhoneSms,
  fetchSession,
  rebindEmailLogin,
  rebindPhoneSms,
  sendEmailCode,
  sendRegisterSms,
} from '../lib/mpApi'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { getAccount, getToken, setSession, type MpAccount } from '../lib/mpSession'

type Kind = 'phone' | 'email'

function cnMobile(raw: string) {
  return /^1\d{10}$/.test(raw.replace(/\D/g, ''))
}

function emailOk(raw: string) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw.trim())
}

export default function TalentAccountBindPanel() {
  const [acc, setAcc] = useState<MpAccount | null>(getAccount())
  const [kind, setKind] = useState<Kind | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')

  const ids = acc?.identities

  useEffect(() => {
    const token = getToken()
    if (!token) return
    void fetchSession()
      .then((r) => {
        setSession(token, r.account)
        setAcc(r.account)
      })
      .catch(() => setAcc(getAccount()))
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const platform: 'wx' | 'dy' = ids?.douyin && !ids?.wechat ? 'dy' : 'wx'

  const send = async () => {
    setErr('')
    if (kind === 'phone') {
      if (!cnMobile(value)) {
        setErr('请输入有效手机号')
        return
      }
      await sendRegisterSms(value.replace(/\D/g, ''))
    } else {
      if (!emailOk(value)) {
        setErr('请输入有效邮箱')
        return
      }
      await sendEmailCode(value.trim())
    }
    setCooldown(60)
  }

  const boundNow = kind === 'phone' ? Boolean(ids?.phone) : kind === 'email' ? Boolean(ids?.email) : false

  const submit = async () => {
    if (!kind) return
    setBusy(true)
    setErr('')
    try {
      const replacing = boundNow && editing
      const r = replacing
        ? kind === 'phone'
          ? await rebindPhoneSms(value.replace(/\D/g, ''), code.trim())
          : await rebindEmailLogin(value.trim(), code.trim())
        : kind === 'phone'
          ? await bindPhoneSms(value.replace(/\D/g, ''), code.trim(), platform)
          : await bindEmailLogin(value.trim(), code.trim(), platform)
      const token = r.token || getToken()
      if (token) setSession(token, r.account)
      setAcc(r.account)
      const after = kind === 'phone' ? Boolean(r.account.identities?.phone) : Boolean(r.account.identities?.email)
      if (!replacing && !after && !boundNow) {
        setErr('该账号已有另一个登录名。同一手机号或邮箱会把微信、抖音并到已有账号，新的联系方式不能再单独挂上。')
        return
      }
      setKind(null)
      setEditing(false)
      setValue('')
      setCode('')
      setHint(replacing ? '已换绑' : '已绑定。同一手机号或邮箱下的微信、抖音会并成一个账号。')
    } catch (e) {
      setErr(formatMpApiErr(e, boundNow && editing ? '换绑失败' : '绑定失败'))
    } finally {
      setBusy(false)
    }
  }

  const items: { id: 'wechat' | 'douyin' | 'phone' | 'email'; label: string; logo: string }[] = [
    { id: 'wechat', label: '微信', logo: '/platforms/wechat.png' },
    { id: 'douyin', label: '抖音', logo: '/platforms/douyin.png' },
    {
      id: 'phone',
      label: '手机',
      logo: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#0ea5e9"/><rect x="16" y="8" width="16" height="32" rx="3" fill="#fff"/><circle cx="24" cy="35" r="1.6" fill="#0ea5e9"/></svg>'),
    },
    {
      id: 'email',
      label: '邮箱',
      logo: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#f59e0b"/><rect x="8" y="14" width="32" height="20" rx="3" fill="#fff"/><path d="M10 16l14 10L38 16" fill="none" stroke="#f59e0b" stroke-width="2"/></svg>'),
    },
  ]

  return (
    <div className="surface-card rounded-xl border p-4">
      <p className="text-sm font-medium text-[var(--shell-text)]">账号绑定</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--shell-muted)]">
        和商家小程序一样：手机号、邮箱用验证码绑定；同一号码会把微信和抖音并成一个账号。
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {items.map((it) => {
          const on = Boolean(ids?.[it.id])
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                setErr('')
                setHint('')
                if (it.id === 'wechat') {
                  setKind(null)
                  setHint(on ? '微信已绑定' : '请在达人小程序「我的 → 账号绑定」里使用微信一键登录')
                  return
                }
                if (it.id === 'douyin') {
                  setKind(null)
                  setHint(on ? '抖音已绑定' : '请在登录页使用抖音扫码，并用同一手机号或邮箱完成绑定')
                  return
                }
                setKind(it.id)
                setEditing(false)
                setValue('')
                setCode('')
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs ${
                on
                  ? 'border-amber-200 bg-amber-50 text-[var(--shell-text)]'
                  : 'border-[var(--shell-border)] text-[var(--shell-muted)]'
              }`}
            >
              <img src={it.logo} alt="" className="h-7 w-7 rounded-md object-contain" />
              <span>{it.label}</span>
              <span className="text-[10px]">{on ? '已绑定' : '未绑定'}</span>
            </button>
          )
        })}
      </div>
      {ids?.phoneMasked || ids?.emailMasked ? (
        <p className="mt-2 text-[11px] text-[var(--shell-muted)]">
          {ids.phoneMasked ? `手机 ${ids.phoneMasked}` : ''}
          {ids.phoneMasked && ids.emailMasked ? ' · ' : ''}
          {ids.emailMasked ? `邮箱 ${ids.emailMasked}` : ''}
        </p>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-[var(--shell-muted)]">{hint}</p> : null}
      {kind && boundNow && !editing ? (
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-amber-400 py-2 text-sm text-amber-700"
          onClick={() => {
            setEditing(true)
            setValue('')
            setCode('')
            setErr('')
            setHint('')
          }}
        >
          换绑
        </button>
      ) : null}
      {kind && (!boundNow || editing) ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            className="w-full rounded-lg border border-[var(--shell-border)] bg-transparent px-3 py-2 text-sm"
            placeholder={kind === 'phone' ? (editing ? '新手机号' : '11 位手机号') : editing ? '新邮箱' : '邮箱'}
            value={value}
            onChange={(e) =>
              setValue(kind === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value)
            }
          />
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-[var(--shell-border)] bg-transparent px-3 py-2 text-sm"
              placeholder="6 位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border border-[var(--shell-border)] px-3 text-xs"
              disabled={cooldown > 0}
              onClick={() => void send().catch((e) => setErr(formatMpApiErr(e, '验证码发送失败')))}
            >
              {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
            </button>
          </div>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-amber-500 py-2 text-sm text-white disabled:opacity-60"
          >
            {busy ? '提交中…' : editing ? '确定' : '绑定'}
          </button>
        </form>
      ) : err ? (
        <p className="mt-2 text-xs text-red-600">{err}</p>
      ) : null}
    </div>
  )
}
