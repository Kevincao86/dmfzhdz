import { useEffect, useState } from 'react'
import { xingxuanEnhanceApi } from '../lib/mpSync/xingxuanEnhanceApi'

type PoolEntry = {
  id: string
  displayName?: string
  platform?: string
  lastCoopAt?: string
  note?: string
  tags?: string[]
}

export default function XingxuanCooperationPage() {
  const [entries, setEntries] = useState<PoolEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const res = (await xingxuanEnhanceApi.getCooperationPool()) as { pool?: PoolEntry[] }
    setEntries(res.pool || [])
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">合作达人池</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">从已完成商单沉淀可复用达人</p>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <button
        type="button"
        className="rounded-full border px-4 py-2 text-sm"
        disabled={syncing}
        onClick={() => {
          setSyncing(true)
          void xingxuanEnhanceApi
            .syncCooperationPool()
            .then(() => load())
            .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
            .finally(() => setSyncing(false))
        }}
      >
        {syncing ? '同步中…' : '从已完成订单同步'}
      </button>
      {!entries.length ? (
        <p className="text-sm text-[var(--shell-muted)]">暂无合作达人</p>
      ) : (
        entries.map((item) => (
          <div key={item.id} className="surface-card rounded-xl border p-4 space-y-2">
            <div className="flex justify-between gap-4">
              <p className="font-medium">{item.displayName || item.id}</p>
            </div>
            <p className="text-sm text-[var(--shell-muted)]">{item.platform || '—'} · 最近 {item.lastCoopAt || '—'}</p>
            {item.note ? <p className="text-sm">{item.note}</p> : null}
            {item.tags?.length ? (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span key={t} className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="text-xs text-red-700"
              onClick={() => {
                if (!window.confirm('确定移出该达人？')) return
                void xingxuanEnhanceApi.removeCooperation(item.id).then(() => load())
              }}
            >
              移出池
            </button>
          </div>
        ))
      )}
    </div>
  )
}
