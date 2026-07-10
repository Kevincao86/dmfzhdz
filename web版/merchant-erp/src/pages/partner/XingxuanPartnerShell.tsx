import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { cn } from '../../cn'
import { XINGXUAN_PARTNER_NAV } from '../../config/xingxuanPartnerNav'
import {
  ensurePartnerXingxuanBootstrap,
  type PartnerXingxuanBootstrapPayload,
} from '../../lib/partnerXingxuanBootstrapClient'
import { xingxuanWebOrigin } from '../../lib/xingxuanPlatformUrl'
import { usePartnerClients } from '../../context/PartnerClientContext'
import ModulePage from '../ModulePage'

function XingxuanPartnerIframe({ iframePath }: { iframePath: string }) {
  const [boot, setBoot] = useState<PartnerXingxuanBootstrapPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const { activeClient, scopeLabel } = usePartnerClients()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setErr(null)
      setBoot(null)
      const r = await ensurePartnerXingxuanBootstrap(true)
      if (cancelled) return
      if (!r.ok) {
        setErr(r.message)
        return
      }
      setBoot({
        mpSessionToken: r.mpSessionToken,
        account: r.account,
        lingqiPrId: r.lingqiPrId,
        created: r.created,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [retryKey])

  const src = useMemo(() => {
    if (!boot?.mpSessionToken) return ''
    const base = xingxuanWebOrigin()
    const q = new URLSearchParams({
      from: 'fws-embed',
      embed: 'partner',
      mp_token: boot.mpSessionToken,
    })
    if (activeClient?.id) q.set('partnerClientId', activeClient.id)
    if (activeClient?.clientLabel) q.set('partnerClientLabel', activeClient.clientLabel)
    const join = iframePath.includes('?') ? '&' : '?'
    return `${base}${iframePath}${join}${q.toString()}`
  }, [iframePath, activeClient?.id, activeClient?.clientLabel, boot?.mpSessionToken])

  if (err) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
        <p>{err}</p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="inline-flex items-center rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          重新同步星选账号
        </button>
        <p className="text-xs text-amber-800/90">
          也可前往「系统设置 → 平台连接」查看星选关联状态；须使用与 ERP 相同的大陆手机号。
        </p>
      </div>
    )
  }

  if (!boot?.mpSessionToken || !src) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在同步星选 PR 账号…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        已自动开通星选 PR 账号；扣费走 fws 套餐桶与充值积分。
        {activeClient ? ` 当前客户：${scopeLabel}` : ' 可在顶栏切换代运营客户。'}
        {' '}
        内嵌页已注入星选会话，无需在 dr 站重复登录。
      </p>
      <iframe
        title="星选达人招募"
        src={src}
        className="h-[calc(100dvh-14rem)] min-h-[480px] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

export function XingxuanPartnerShell() {
  const { pathname } = useLocation()

  if (pathname === '/recruitment/xingxuan' || pathname === '/recruitment/xingxuan/') {
    return <Navigate to="/recruitment/xingxuan/hall" replace />
  }

  return (
    <ModulePage title="星选达人招募" subtitle="内嵌灵祺星选 PR 工作台；菜单与星选平台 PR 版一致">
      <nav className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3" aria-label="星选达人招募">
        {XINGXUAN_PARTNER_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                isActive
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-violet-50 hover:text-violet-900',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </ModulePage>
  )
}

export function XingxuanPartnerRoutePage({ iframePath }: { iframePath: string }) {
  return <XingxuanPartnerIframe iframePath={iframePath} />
}
