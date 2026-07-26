import { useEffect, useState } from 'react'
import { fetchMe, readSession, type RegionalPartner } from '../lib/api'

export default function SettingsPage() {
  const session = readSession()
  const [partner, setPartner] = useState<RegionalPartner | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void fetchMe().then((r) => {
      if (!r.ok) {
        setErr(r.error)
        return
      }
      setPartner(r.data.partner)
    })
  }, [])

  const p = partner
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">账号资料</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">权限、城市与分成由平台运营台配置，此处只读</p>
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
    </div>
  )
}
