import { useCallback, useEffect, useState } from 'react'
import { cn } from '../cn'
import wechatLogo from './login/LoginAltMethods.wechat.png'
import { supabase } from '../lib/supabaseClient'
import { isBindEmailValid, isCnMobileValid, postAuthIdentity, sendAuthEmailCode, sendAuthSms } from '../lib/tenantRegisterApi'
import { toUserFacingError } from '../lib/userFacingError'
import type { IdentityActionResult } from '../lib/tenantRegisterApi'

type IdKey = 'wechat' | 'douyin' | 'phone' | 'email'

const ITEMS: { id: IdKey; label: string }[] = [
  { id: 'wechat', label: '微信' },
  { id: 'douyin', label: '抖音' },
  { id: 'phone', label: '手机' },
  { id: 'email', label: '邮箱' },
]

function DouyinMini() {
  return (
    <svg viewBox="0 0 34 34" className="h-8 w-8" aria-hidden>
      <rect width="34" height="34" rx="8" fill="#161823" />
      <text x="17" y="22" textAnchor="middle" fontSize="12" fill="#fff">
        抖
      </text>
    </svg>
  )
}

export default function AccountIdentityBindPanel() {
  const [ids, setIds] = useState<IdentityActionResult['identities']>()
  const [bindKind, setBindKind] = useState<'phone' | 'email' | null>(null)
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [mergeToken, setMergeToken] = useState('')
  const [mergeMsg, setMergeMsg] = useState('')

  const load = useCallback(async () => {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token || ''
    if (!token) return
    const r = await postAuthIdentity({ action: 'identities', access_token: token })
    if (r.ok && r.identities) setIds(r.identities)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const send = async () => {
    setErr('')
    if (bindKind === 'phone') {
      if (!isCnMobileValid(value)) {
        setErr('请输入有效手机号')
        return
      }
      const r = await sendAuthSms(value.replace(/\D/g, ''))
      if (!r.ok) {
        setErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
        return
      }
      setCooldown(60)
      if (r.devCode) setCode(r.devCode)
      return
    }
    if (!isBindEmailValid(value)) {
      setErr('请输入有效邮箱')
      return
    }
    const r = await sendAuthEmailCode(value.trim())
    if (!r.ok) {
      setErr(toUserFacingError(r.message ?? r.error, '验证码发送'))
      return
    }
    setCooldown(60)
    if (r.devCode) setCode(r.devCode)
  }

  const submit = async () => {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token || ''
    setBusy(true)
    setErr('')
    try {
      if (mergeToken) {
        const r = await postAuthIdentity({
          action: 'merge_confirm',
          mergeToken,
          smsCode: bindKind === 'phone' ? code : undefined,
          emailCode: bindKind === 'email' ? code : undefined,
        })
        if (!r.ok) {
          setErr(r.message || '合并失败')
          return
        }
        if (r.access_token && r.refresh_token && supabase) {
          await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token })
        }
        setMergeToken('')
        setBindKind(null)
        await load()
        return
      }
      const r = await postAuthIdentity({
        action: 'bind_contact',
        access_token: token,
        phone: bindKind === 'phone' ? value.replace(/\D/g, '') : undefined,
        email: bindKind === 'email' ? value.trim() : undefined,
        smsCode: bindKind === 'phone' ? code : undefined,
        emailCode: bindKind === 'email' ? code : undefined,
      })
      if (r.error === 'account_exists_merge' && r.mergeToken) {
        setMergeToken(r.mergeToken)
        setMergeMsg(r.message || '已有该账号，是否确定合并？')
        setCode('')
        return
      }
      if (!r.ok) {
        setErr(r.message || '绑定失败')
        return
      }
      setBindKind(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <p className="mb-3 text-sm font-semibold text-slate-800">已绑定社交账号</p>
      <div className="grid grid-cols-4 gap-2">
        {ITEMS.map((it) => {
          const on = Boolean(ids?.[it.id])
          return (
            <button
              key={it.id}
              type="button"
              title={on ? `已绑定${it.label}` : `未绑定${it.label}`}
              onClick={() => {
                setErr('')
                setHint('')
                setMergeToken('')
                if (it.id === 'wechat') {
                  setHint('请在商家小程序内使用微信一键登录完成绑定')
                  return
                }
                if (it.id === 'douyin') {
                  setHint('请在登录页使用抖音扫码完成绑定')
                  return
                }
                setBindKind(it.id)
                setValue('')
                setCode('')
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition',
                on ? 'border-cyan-200 bg-cyan-50 text-slate-800' : 'border-slate-200 bg-slate-50 text-slate-400',
              )}
            >
              <span className={cn('flex h-8 w-8 items-center justify-center', !on && 'opacity-35 grayscale')}>
                {it.id === 'wechat' ? (
                  <img src={wechatLogo} alt="" className="h-8 w-8 rounded-lg" />
                ) : it.id === 'douyin' ? (
                  <DouyinMini />
                ) : it.id === 'phone' ? (
                  <span className="text-lg">📱</span>
                ) : (
                  <span className="text-lg">✉️</span>
                )}
              </span>
              {it.label}
              <span className="text-[10px]">{on ? '已绑定' : '未绑定'}</span>
            </button>
          )
        })}
      </div>
      {ids?.phoneMasked || ids?.emailMasked ? (
        <p className="mt-2 text-[11px] text-slate-500">
          {ids.phoneMasked ? `手机 ${ids.phoneMasked}` : ''}
          {ids.phoneMasked && ids.emailMasked ? ' · ' : ''}
          {ids.emailMasked ? `邮箱 ${ids.emailMasked}` : ''}
        </p>
      ) : null}
      {hint ? <p className="mt-3 text-xs text-slate-500">{hint}</p> : null}
      {bindKind ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800">
            {mergeToken ? '确认合并账号' : bindKind === 'phone' ? '绑定手机号' : '绑定邮箱'}
          </p>
          {mergeToken ? <p className="text-xs text-slate-600">{mergeMsg}</p> : null}
          {!mergeToken ? (
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={bindKind === 'phone' ? '11 位手机号' : '邮箱'}
              value={value}
              onChange={(e) =>
                setValue(bindKind === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value)
              }
            />
          ) : null}
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="6 位验证码"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg border px-3 text-xs text-cyan-700"
              disabled={cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
            </button>
          </div>
          {err ? <p className="text-xs text-red-600">{err}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setBindKind(null)}>
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white"
              onClick={() => void submit()}
            >
              {mergeToken ? '确定合并' : '确认绑定'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
