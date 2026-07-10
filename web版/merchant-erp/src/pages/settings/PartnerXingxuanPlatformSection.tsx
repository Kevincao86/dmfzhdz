import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  clearPartnerXingxuanMpSession,
  ensurePartnerXingxuanBootstrap,
  readPartnerXingxuanMpToken,
} from '../../lib/partnerXingxuanBootstrapClient'
import { phoneFromAuthUser } from '../../lib/tenantLocalState'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'

export default function PartnerXingxuanPlatformSection() {
  const [linked, setLinked] = useState(Boolean(readPartnerXingxuanMpToken()))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [phoneLabel, setPhoneLabel] = useState('—')

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const mobile = phoneFromAuthUser({ phone: u.phone, user_metadata: u.user_metadata as { phone?: string } })
      setPhoneLabel(mobile || '未绑定')
    })
  }, [])

  const sync = useCallback(async (force = true) => {
    setBusy(true)
    setErr(null)
    setHint(null)
    if (force) clearPartnerXingxuanMpSession()
    const r = await ensurePartnerXingxuanBootstrap(force)
    setBusy(false)
    if (!r.ok) {
      setLinked(false)
      setErr(r.message)
      return
    }
    setLinked(true)
    setHint(r.created ? '已自动开通星选 PR 账号并完成关联' : '星选 PR 账号已关联，可前往「运营 → 星选达人招募」使用')
  }, [])

  useEffect(() => {
    void sync(true)
  }, [sync])

  return (
    <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">灵祺星选平台（PR 工作台）</h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            服务商版自动以 ERP 登录手机号开通/关联星选 PR 账号，用于「运营 → 星选达人招募」内嵌页与招募发单。
            当前 ERP 手机号：<strong className="font-medium text-slate-800">{phoneLabel}</strong>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            linked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {linked ? '已关联' : '未关联'}
        </span>
      </div>

      {err ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {err}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {hint}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void sync(true)}
          className="inline-flex items-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          {linked ? '重新同步' : '立即关联'}
        </button>
      </div>
    </div>
  )
}
