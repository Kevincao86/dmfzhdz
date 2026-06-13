import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { loadAllOrderRows } from '../lib/mpRecruitment/orderCard'
import { readOrderFavoriteIds, toggleOrderFavorite } from '../lib/mpSync/orderFavorites'
import { resolveOrderCoverUrl } from '../lib/mpSync/recruitCoverLibrary'
import RecruitmentOrderCard from '../components/mp/RecruitmentOrderCard'
import { EmptyState } from '../components/ui/MockupLayouts'
import { useRecruitmentNav } from '../lib/useRecruitmentNav'

export default function FavoritesPage() {
  const goDetail = useRecruitmentNav()
  const [loading, setLoading] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const ids = [...readOrderFavoriteIds()]
      setFavoriteIds(ids)
      setLoading(false)
    })()
  }, [])

  const [rows, setRows] = useState<ReturnType<typeof loadAllOrderRows>>([])

  useEffect(() => {
    if (!favoriteIds.length) {
      setRows([])
      return
    }
    ;(async () => {
      try {
        const reg = await fetchMpRegistry({ includeLocalContext: true })
        const all = loadAllOrderRows(reg)
        const idSet = new Set(favoriteIds)
        setRows(all.filter((r) => idSet.has(String(r.id))))
      } catch {
        setRows([])
      }
    })()
  }, [favoriteIds])

  function onUnfavorite(id: string) {
    toggleOrderFavorite(id)
    setFavoriteIds((prev) => prev.filter((x) => x !== id))
  }

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <header>
        <h1 className="text-xl font-bold">我的收藏</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">收藏的招募商单，与小程序「我的收藏」同步本机数据</p>
      </header>

      {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}

      {!loading && !favoriteIds.length ? (
        <EmptyState
          title="暂无收藏"
          desc="在招募大厅或推荐大厅点击星标即可收藏商单"
          action={
            <Link to="/hall?tab=hall" className="btn-mockup btn-mockup--primary no-underline">
              去招募大厅
            </Link>
          }
        />
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="relative">
            <RecruitmentOrderCard
              row={row}
              variant="hall"
              coverUrl={resolveOrderCoverUrl({ platform: row.platform })}
              onClick={() => goDetail(row)}
            />
            <button
              type="button"
              className="absolute top-3 right-3 z-10 px-2 py-1 rounded-md text-xs bg-white/90 border border-[var(--shell-border)] text-amber-600"
              onClick={() => onUnfavorite(row.id)}
            >
              取消收藏
            </button>
          </div>
        ))}
      </div>

      {!loading && favoriteIds.length && !rows.length ? (
        <EmptyState title="收藏的商单已结束或不可见" desc="可取消失效收藏后重新收藏在招商单" />
      ) : null}
    </div>
  )
}
