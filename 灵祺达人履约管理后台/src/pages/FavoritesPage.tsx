import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExternalLink, MessageCircle, Star } from 'lucide-react'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { loadAllOrderRows } from '../lib/mpRecruitment/orderCard'
import { buildBoardPool } from '../lib/mpRecruitment/prRecommendBoard'
import type { TalentCardRow } from '../lib/mpRecruitment/types'
import { readOrderFavoriteIds, toggleOrderFavorite } from '../lib/mpSync/orderFavorites'
import {
  readFavoriteIds as readTalentFavoriteIds,
  toggleFavorite as toggleTalentFavorite,
} from '../lib/mpSync/talentFavorites'
import {
  canChat,
  ensureSessionWithTalent,
  formatChatError,
  syncProfile,
} from '../lib/mpSync/talentChat'
import { openTalentProfileHref, shortProfileLinkButtonLabel } from '../lib/mpSync/talentProfileLink'
import { resolveOrderCoverUrl } from '../lib/mpSync/recruitCoverLibrary'
import RecruitmentOrderCard from '../components/mp/RecruitmentOrderCard'
import { EmptyState } from '../components/ui/MockupLayouts'
import { useRecruitmentNav } from '../lib/useRecruitmentNav'

function platformNiche(row: TalentCardRow): string {
  const tag = row.tags[0] || row.quality || row.salesGrade
  return tag ? `${row.platform} · ${tag}` : row.platform
}

function OrderFavoritesView() {
  const goDetail = useRecruitmentNav()
  const [loading, setLoading] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [rows, setRows] = useState<ReturnType<typeof loadAllOrderRows>>([])

  useEffect(() => {
    setFavoriteIds([...readOrderFavoriteIds()])
    setLoading(false)
  }, [])

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
    <>
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
    </>
  )
}

function PrTalentFavoritesView() {
  const navigate = useNavigate()
  const role = getActiveRole()
  const [loading, setLoading] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [rows, setRows] = useState<TalentCardRow[]>([])
  const [chatLoadingId, setChatLoadingId] = useState('')
  const [registry, setRegistry] = useState<Awaited<ReturnType<typeof fetchMpRegistry>> | null>(null)

  useEffect(() => {
    setFavoriteIds([...readTalentFavoriteIds()])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!favoriteIds.length) {
      setRows([])
      return
    }
    ;(async () => {
      try {
        const reg = await fetchMpRegistry({ includeRecommendPool: true })
        setRegistry(reg)
        const pool = [
          ...buildBoardPool(reg, 'talent'),
          ...buildBoardPool(reg, 'shoot'),
          ...buildBoardPool(reg, 'edit'),
        ]
        const idSet = new Set(favoriteIds)
        const seen = new Set<string>()
        const matched: TalentCardRow[] = []
        for (const row of pool) {
          if (!idSet.has(row.id) || seen.has(row.id)) continue
          seen.add(row.id)
          matched.push(row)
        }
        setRows(matched)
      } catch {
        setRows([])
      }
    })()
  }, [favoriteIds])

  function onUnfavorite(id: string) {
    toggleTalentFavorite(id)
    setFavoriteIds((prev) => prev.filter((x) => x !== id))
  }

  async function onChatTap(row: TalentCardRow) {
    if (role !== 'pr') {
      window.alert('请使用 PR 身份发起沟通。')
      return
    }
    if (!canChat()) {
      window.alert('未配置后台 API，无法发起私信。')
      return
    }
    setChatLoadingId(row.id)
    try {
      await syncProfile()
      const sessionId = await ensureSessionWithTalent(
        {
          id: row.id,
          talentMemberId: row.id,
          name: row.name,
          avatar: row.avatar || '',
        },
        registry,
      )
      navigate(
        `/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(row.name)}` +
          `&peerAvatar=${encodeURIComponent(row.avatar || '')}` +
          `&peerId=${encodeURIComponent(row.id)}` +
          `&peerTalentId=${encodeURIComponent(row.id)}`,
      )
    } catch (e) {
      window.alert(formatChatError(e))
    } finally {
      setChatLoadingId('')
    }
  }

  return (
    <>
      {loading ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}
      {!loading && !favoriteIds.length ? (
        <EmptyState
          title="暂无收藏达人"
          desc="在推荐大厅点击星标即可收藏达人、拍摄或剪辑团队"
          action={
            <Link to="/hall?tab=recommend" className="btn-mockup btn-mockup--primary no-underline">
              去推荐大厅
            </Link>
          }
        />
      ) : null}
      <div className="pr-recommend-grid">
        {rows.map((t) => (
          <article key={t.id} className="pr-talent-card surface-card">
            <div className="pr-talent-card__body">
              <div className="pr-talent-card__top">
                <div className="pr-talent-card__identity">
                  {t.avatar ? (
                    <img src={t.avatar} alt="" className="pr-talent-card__avatar" />
                  ) : (
                    <div className="pr-talent-card__avatar pr-talent-card__avatar--ph">{t.name.slice(0, 1)}</div>
                  )}
                  <div className="min-w-0">
                    <div className="pr-talent-card__name-row">
                      <h3>{t.name}</h3>
                      <span className="pr-talent-card__verify" aria-label="认证达人">
                        V
                      </span>
                    </div>
                    <p className="pr-talent-card__niche">{platformNiche(t)}</p>
                    <p className="pr-talent-card__fans">
                      粉丝 {t.followers === '团队' ? t.salesGrade : t.followers}
                    </p>
                  </div>
                </div>
              </div>
              <div className="pr-talent-card__tags">
                {(t.tags.length ? t.tags : [t.quality || '优质']).slice(0, 4).map((tag) => (
                  <span key={tag} className="pr-talent-card__tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="pr-talent-card__actions">
              <button
                type="button"
                className="pr-talent-card__fav is-on"
                onClick={() => onUnfavorite(t.id)}
                aria-label="取消收藏"
              >
                <Star size={14} fill="currentColor" />
                已收藏
              </button>
              {t.hasProfileLink && t.profileHref ? (
                <button
                  type="button"
                  className="pr-talent-card__profile"
                  onClick={() => openTalentProfileHref(t.profileHref!)}
                  aria-label={shortProfileLinkButtonLabel(t.platform)}
                  title={shortProfileLinkButtonLabel(t.platform)}
                >
                  <ExternalLink size={13} aria-hidden />
                  主页
                </button>
              ) : (
                <span className="pr-talent-card__profile-placeholder" aria-hidden />
              )}
              <button
                type="button"
                className="pr-talent-card__chat"
                disabled={chatLoadingId === t.id}
                onClick={() => void onChatTap(t)}
              >
                <MessageCircle size={14} aria-hidden />
                {chatLoadingId === t.id ? '连接中…' : '沟通'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!loading && favoriteIds.length && !rows.length ? (
        <EmptyState
          title="收藏的达人暂不可见"
          desc="可能已下线或尚未同步，可在推荐大厅重新收藏"
          action={
            <Link to="/hall?tab=recommend" className="btn-mockup btn-mockup--outline no-underline">
              去推荐大厅
            </Link>
          }
        />
      ) : null}
    </>
  )
}

export default function FavoritesPage() {
  const isPr = getWorkIdentity() === 'pr'
  const subtitle = isPr
    ? '收藏的达人 / 拍摄 / 剪辑团队，与推荐大厅星标同步本机数据'
    : '收藏的招募商单，与小程序「我的收藏」同步本机数据'

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <header>
        <h1 className="text-xl font-bold">我的收藏</h1>
        <p className="text-sm text-[var(--shell-muted)] mt-1">{subtitle}</p>
      </header>
      {isPr ? <PrTalentFavoritesView /> : <OrderFavoritesView />}
    </div>
  )
}
