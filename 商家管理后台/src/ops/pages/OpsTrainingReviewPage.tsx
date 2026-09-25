import { useCallback, useEffect, useState } from 'react'

const TRAINING_API = [
  'https://mofangdianai.com/erp-api/meoo-mp-training',
  'https://dr.mofangdianai.com/erp-api/meoo-mp-training',
]

async function trainingFetch(query: string, init?: RequestInit) {
  let last = '培训接口没有连上'
  for (const base of TRAINING_API) {
    try {
      return await fetch(`${base}${query}`, { ...init, cache: 'no-store' })
    } catch (e) {
      last = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '培训接口没有连上'
    }
  }
  throw new Error(last)
}

type Row = {
  id: string
  title: string
  hostName: string
  mode: 'online' | 'offline'
  city?: string
  fee?: string
  poster?: string
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  createdAt?: string
}

export default function OpsTrainingReviewPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const res = await trainingFetch('?review=1')
    const data = (await res.json()) as { ok?: boolean; error?: string; courses?: Row[] }
    if (!res.ok || data.ok === false) throw new Error(data.error || '加载失败')
    setRows(Array.isArray(data.courses) ? data.courses : [])
  }, [])

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [load])

  async function review(id: string, status: 'approved' | 'rejected') {
    setBusyId(id)
    setErr('')
    try {
      const res = await trainingFetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', id, status }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || data.ok === false) throw new Error(data.error || '审核失败')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败')
    } finally {
      setBusyId('')
    }
  }

  const pending = rows.filter((r) => r.reviewStatus === 'pending')
  const rest = rows.filter((r) => r.reviewStatus !== 'pending')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">培训审核</h1>
        <p className="ops-muted mt-1 text-sm">审核培训课程。通过后，带宣传海报的课程可以排到首页广告栏。</p>
      </div>
      {err ? <p className="ops-hint-warn text-sm">{err}</p> : null}
      <div className="space-y-3">
        {[...pending, ...rest].map((row) => (
          <article key={row.id} className="flex gap-4 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4 shadow-[var(--ops-card-shadow)]">
            {row.poster ? (
              <img src={row.poster} alt="" className="h-24 w-40 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="ops-muted flex h-24 w-40 shrink-0 items-center justify-center rounded-xl bg-[var(--ops-bg)] text-xs">无海报</div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{row.title}</h2>
              <p className="ops-muted mt-1 text-sm">
                {row.hostName} · {row.mode === 'offline' ? '线下' : '线上'}
                {row.city ? ` · ${row.city}` : ''} · ¥{row.fee || '0'}
              </p>
              <p className="ops-hint mt-1 text-xs">
                {row.reviewStatus === 'pending' ? '待审核' : row.reviewStatus === 'rejected' ? '已驳回' : '已通过'}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={() => review(row.id, 'approved')}
                >
                  通过
                </button>
                <button type="button" disabled={busyId === row.id} className="ops-btn-soft" onClick={() => review(row.id, 'rejected')}>
                  驳回
                </button>
              </div>
            </div>
          </article>
        ))}
        {!rows.length ? <p className="ops-muted py-8 text-center text-sm">还没有培训课程。</p> : null}
      </div>
    </div>
  )
}
