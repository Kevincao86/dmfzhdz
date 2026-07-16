import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  ChevronDown,
  ExternalLink,
  MessageCircle,
  Scissors,
  SlidersHorizontal,
  Star,
  UserRound,
} from 'lucide-react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getActiveRole } from '../../lib/mpSession'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import {
  buildPrMatchOrderOptions,
  PR_MATCH_RECENT,
  readPrMatchOrderId,
  writePrMatchOrderId,
  type PrMatchOrderOption,
} from '../../lib/mpRecruitment/prMatchOrderSelect'
import {
  boardAllModeLabel,
  boardEmptyHint,
  buildBoardPool,
  countPrOrdersForBoard,
  PR_BOARD_SEGMENTS,
  smartMatchNeedRecruitHint,
  type PrBoardId,
} from '../../lib/mpRecruitment/prRecommendBoard'
import { dedupeTalentRows } from '../../lib/mpRecruitment/dedupeTalentRows'
import { logRecommendPoolParity } from '../../lib/mpRecruitment/recommendPoolVerify'
import {
  buildMatchCacheKey,
  buildOrderSig,
  readEnrichedRows,
  writeEnrichedRows,
} from '../../lib/mpRecruitment/prRecommendMatchStore'
import type { MpRegistry, TalentCardRow } from '../../lib/mpRecruitment/types'
import { matchTalentFilters } from '../../lib/mpRecruitment/talentFormat'
import {
  canChat,
  ensureSessionWithTalent,
  formatChatError,
  syncProfile,
} from '../../lib/mpSync/talentChat'
import {
  isFavorite as isTalentFavorite,
  toggleFavorite as toggleTalentFavorite,
} from '../../lib/mpSync/talentFavorites'
import { openTalentProfileHref, shortProfileLinkButtonLabel } from '../../lib/mpSync/talentProfileLink'
import HallCityFilter from './HallCityFilter'
import PrMatchOrderPicker from './PrMatchOrderPicker'
import { EmptyState } from '../ui/MockupLayouts'
import {
  clearStoredHallRegion,
  resolveHallRegionFilter,
  writeStoredHallRegion,
} from '../../lib/mpSync/hallRegionLocate'

const TAG_FILTERS = ['全部', '优质', '推荐', '新锐', '会员', '美食', '亲子', '美妆']
const GENDER_FILTERS = ['全部', '男', '女']
const FOLLOWER_FILTERS = ['全部', '1万以下', '1-10万', '10-50万', '50万以上']
const QUOTE_FILTERS = ['全部', '¥5000以下', '¥5000-1万', '¥1-3万', '¥3万以上']
const SORT_FILTERS = ['综合排序', '匹配度优先', '粉丝量优先']

const BOARD_ICONS = {
  talent: UserRound,
  shoot: Camera,
  edit: Scissors,
} as const

type ViewMode = 'ai' | 'all'
type SortKey = 'default' | 'match' | 'followers'

function TalentCardAvatar({ name, avatar }: { name: string; avatar: string }) {
  const [broken, setBroken] = useState(false)
  const url = String(avatar || '').trim()
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="pr-talent-card__avatar"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    )
  }
  return <div className="pr-talent-card__avatar pr-talent-card__avatar--ph">{name.slice(0, 1)}</div>
}

function matchTalentSearch(row: TalentCardRow, keyword: string) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  return [row.id, row.name, row.platform, row.region, row.salesGrade, row.quality, ...row.tags]
    .join(' ')
    .toLowerCase()
    .includes(k)
}

function matchFollowerBucket(row: TalentCardRow, bucket: string): boolean {
  if (bucket === '全部') return true
  const n = row.followersRaw || 0
  if (bucket === '1万以下') return n < 10000
  if (bucket === '1-10万') return n >= 10000 && n < 100000
  if (bucket === '10-50万') return n >= 100000 && n < 500000
  if (bucket === '50万以上') return n >= 500000
  return true
}

function platformNiche(row: TalentCardRow): string {
  const tag = row.tags[0] || row.quality || row.salesGrade
  return tag ? `${row.platform} · ${tag}` : row.platform
}

function cardTags(row: TalentCardRow, viewMode: ViewMode): string[] {
  const base = [...(row.accountTags.length ? row.accountTags : row.tags)]
  if (viewMode === 'ai' && row.aiTag) base.unshift(row.aiTag)
  return [...new Set(base.filter(Boolean))].slice(0, 6)
}

function cardAdvantage(row: TalentCardRow, viewMode: ViewMode): string {
  if (viewMode === 'ai' && row.aiAdvantage) return row.aiAdvantage
  if (row.accountTags.length) return `擅长${row.accountTags.slice(0, 2).join('、')}类内容`
  if (row.tags.length) return `${row.platform}达人 · ${row.quality || row.tags[0]}`
  return ''
}

function quoteRange(row: TalentCardRow): string {
  if (row.salesGrade && /¥|元|k|K/.test(row.salesGrade)) return row.salesGrade
  if (row.followersRaw >= 500000) return '¥15,000 - ¥25,000'
  if (row.followersRaw >= 100000) return '¥8,000 - ¥15,000'
  if (row.followersRaw >= 10000) return '¥3,000 - ¥8,000'
  return '面议'
}

type Props = { embedded?: boolean }

export default function RecommendTalentPanel({ embedded: _embedded = false }: Props) {
  const navigate = useNavigate()
  const role = getActiveRole()
  const [prBoard, setPrBoard] = useState<PrBoardId>('talent')
  const [viewMode, setViewMode] = useState<ViewMode>('ai')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  useEffect(() => {
    let cancelled = false
    void resolveHallRegionFilter().then((hit) => {
      if (cancelled || !hit) return
      setFilterProvince(hit.province || '全部')
      setFilterCity(hit.city || '全部')
    })
    return () => {
      cancelled = true
    }
  }, [])
  const [filterTag, setFilterTag] = useState('全部')
  const [filterGender, setFilterGender] = useState('全部')
  const [filterFollowers, setFilterFollowers] = useState('全部')
  const [filterQuote, setFilterQuote] = useState('全部')
  const [sortKey, setSortKey] = useState<SortKey>('default')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [favoriteTick, setFavoriteTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [chatLoadingId, setChatLoadingId] = useState('')
  const [err, setErr] = useState('')
  const [allRows, setAllRows] = useState<TalentCardRow[]>([])
  const [displayRows, setDisplayRows] = useState<TalentCardRow[]>([])
  const [listEmptyHint, setListEmptyHint] = useState('')
  const [prBoardOrderCount, setPrBoardOrderCount] = useState(0)
  const [selectedMatchOrderId, setSelectedMatchOrderId] = useState(PR_MATCH_RECENT)
  const [matchOrderOptions, setMatchOrderOptions] = useState<PrMatchOrderOption[]>([])
  const [registryCache, setRegistryCache] = useState<MpRegistry | null>(null)
  const [boardPools, setBoardPools] = useState<Record<PrBoardId, TalentCardRow[]>>({
    talent: [],
    shoot: [],
    edit: [],
  })
  const enrichedPoolRef = useRef<TalentCardRow[] | null>(null)
  const matchCacheKeyRef = useRef('')
  const filterTokenRef = useRef(0)
  const enrichInflightRef = useRef<Promise<TalentCardRow[]> | null>(null)

  const allModeLabel = useMemo(() => boardAllModeLabel(prBoard), [prBoard])

  const clearEnrichedCache = useCallback(() => {
    enrichedPoolRef.current = null
    matchCacheKeyRef.current = ''
    enrichInflightRef.current = null
  }, [])

  const poolForBoard = useCallback(
    (board: PrBoardId) => {
      const fromPools = boardPools[board]
      if (fromPools?.length) return fromPools
      if (board === prBoard && allRows.length) return allRows
      return fromPools || []
    },
    [boardPools, prBoard, allRows],
  )

  const ensureEnrichedTalentPool = useCallback(async () => {
    const reg = registryCache
    const pool = poolForBoard(prBoard)
    if (!reg || !pool.length) return pool
    const packs = recruitmentAi.resolvePrMatchOrders(reg, {
      board: prBoard,
      mpOrderId: selectedMatchOrderId,
    })
    const cacheKey = buildMatchCacheKey(prBoard, selectedMatchOrderId, buildOrderSig(packs))
    if (matchCacheKeyRef.current === cacheKey && enrichedPoolRef.current) {
      return enrichedPoolRef.current
    }
    const stored = readEnrichedRows(cacheKey)
    if (stored && stored.length) {
      const rows = dedupeTalentRows(stored as TalentCardRow[])
      matchCacheKeyRef.current = cacheKey
      enrichedPoolRef.current = rows
      return rows
    }
    if (enrichInflightRef.current && matchCacheKeyRef.current === cacheKey) {
      return enrichInflightRef.current
    }
    setMatching(true)
    const task = (async () => {
      try {
        let enriched: TalentCardRow[]
        try {
          enriched = dedupeTalentRows(
            await recruitmentAi.enrichTalentMatchesForPr(pool, reg, {
              board: prBoard,
              mpOrderId: selectedMatchOrderId,
            }),
          )
        } catch {
          const packs = recruitmentAi.resolvePrMatchOrders(reg, {
            board: prBoard,
            mpOrderId: selectedMatchOrderId,
          })
          const payloads = packs.map((p) => p.payload)
          enriched = dedupeTalentRows(
            pool.map((t) => {
              const fb = recruitmentAi.fallbackTalentScore(t, payloads, prBoard)
              return {
                ...t,
                matchScore: fb.score,
                aiTag: fb.tag,
                aiTagTone: fb.tone,
                aiAdvantage: fb.advantage,
                aiMatch: fb.score >= 55,
              }
            }),
          )
        }
        writeEnrichedRows(cacheKey, enriched)
        matchCacheKeyRef.current = cacheKey
        enrichedPoolRef.current = enriched
        return enriched
      } finally {
        setMatching(false)
        enrichInflightRef.current = null
      }
    })()
    enrichInflightRef.current = task
    return task
  }, [registryCache, poolForBoard, prBoard, selectedMatchOrderId])

  const applyTalentFilters = useCallback(async () => {
    const token = ++filterTokenRef.current
    const f = {
      platform: filterPlatform,
      province: filterProvince,
      city: filterCity,
      tag: filterTag,
      gender: filterGender,
    }
    const basePool = poolForBoard(prBoard)
    let filtered = basePool.filter(
      (r) =>
        matchTalentFilters(r, f) &&
        matchFollowerBucket(r, filterFollowers) &&
        (filterQuote === '全部' || quoteRange(r).includes(filterQuote.replace('¥', ''))),
    )

    if (viewMode === 'all') {
      filtered = dedupeTalentRows(filtered)
        .slice()
        .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      if (token !== filterTokenRef.current) return
      let hint = ''
      if (!filtered.length) {
        hint = `暂无已注册的${allModeLabel.replace('全部', '')}`
      }
      if (sortKey === 'followers') {
        filtered.sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      }
      setDisplayRows(filtered)
      setListEmptyHint(hint)
      return
    }

    const matchOrderId = selectedMatchOrderId
    const hasMatchOrders =
      matchOrderId !== PR_MATCH_RECENT
        ? matchOrderOptions.some((o) => o.id === matchOrderId)
        : prBoardOrderCount > 0

    if (!hasMatchOrders) {
      if (token !== filterTokenRef.current) return
      setDisplayRows([])
      setListEmptyHint(smartMatchNeedRecruitHint(prBoard))
      return
    }

    if (hasMatchOrders && registryCache && basePool.length) {
      const enrichedPool = await ensureEnrichedTalentPool()
      if (token !== filterTokenRef.current) return
      filtered = enrichedPool.filter(
        (r) =>
          matchTalentFilters(r, f) &&
          matchFollowerBucket(r, filterFollowers) &&
          (filterQuote === '全部' || quoteRange(r).includes(filterQuote.replace('¥', ''))),
      )
      filtered = filtered.filter((t) => (t.matchScore || 0) >= 55)
    }

    filtered = dedupeTalentRows(filtered)
    if (sortKey === 'match') {
      filtered.sort(
        (a, b) =>
          (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0),
      )
    } else if (sortKey === 'followers') {
      filtered.sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    } else {
      filtered.sort(
        (a, b) =>
          (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0),
      )
    }

    if (token !== filterTokenRef.current) return
    let hint = ''
    if (!filtered.length) {
      hint = boardEmptyHint(prBoard, '', hasMatchOrders)
    }
    setDisplayRows(filtered.slice(0, 50))
    setListEmptyHint(hint)
  }, [
    filterPlatform,
    filterProvince,
    filterCity,
    filterTag,
    filterGender,
    filterFollowers,
    filterQuote,
    sortKey,
    prBoardOrderCount,
    registryCache,
    prBoard,
    viewMode,
    allModeLabel,
    selectedMatchOrderId,
    matchOrderOptions,
    ensureEnrichedTalentPool,
    poolForBoard,
  ])

  useEffect(() => {
    void applyTalentFilters()
  }, [applyTalentFilters])

  const syncBoardMeta = useCallback(
    (board: PrBoardId, reg: MpRegistry, pools: Record<PrBoardId, TalentCardRow[]>) => {
      const orderCount = countPrOrdersForBoard(reg, board)
      const eligible = recruitmentAi.listPrEligibleOrders(reg, { board })
      const options = buildPrMatchOrderOptions(eligible)
      let selected = readPrMatchOrderId(board)
      if (selected !== PR_MATCH_RECENT && !options.some((o) => o.id === selected)) {
        selected = PR_MATCH_RECENT
        writePrMatchOrderId(board, PR_MATCH_RECENT)
      }
      setPrBoardOrderCount(orderCount)
      setMatchOrderOptions(options)
      setSelectedMatchOrderId(selected)
      setAllRows(pools[board] || [])
      const packs = recruitmentAi.resolvePrMatchOrders(reg, { board, mpOrderId: selected })
      const nextKey = buildMatchCacheKey(board, selected, buildOrderSig(packs))
      if (matchCacheKeyRef.current && matchCacheKeyRef.current !== nextKey) {
        clearEnrichedCache()
      }
    },
    [clearEnrichedCache],
  )

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry({ includeRecommendPool: true })
      setRegistryCache(reg)
      const pools = {
        talent: buildBoardPool(reg, 'talent'),
        shoot: buildBoardPool(reg, 'shoot'),
        edit: buildBoardPool(reg, 'edit'),
      }
      setBoardPools(pools)
      logRecommendPoolParity(reg, 'talent')
      syncBoardMeta(prBoard, reg, pools)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      setDisplayRows([])
    } finally {
      setLoading(false)
    }
  }, [syncBoardMeta, prBoard])

  useEffect(() => {
    void loadRegistry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onBoardChange(id: PrBoardId) {
    if (id === prBoard) return
    filterTokenRef.current += 1
    clearEnrichedCache()
    setDisplayRows([])
    setListEmptyHint('')
    setViewMode('ai')
    setPrBoard(id)
    setFilterTag('全部')
    setFilterPlatform('全部')
    setFilterProvince('全部')
    setFilterCity('全部')
    const pool = boardPools[id] || []
    if (registryCache) {
      syncBoardMeta(id, registryCache, boardPools)
    } else {
      setAllRows(pool)
    }
  }

  function onViewModeChange(mode: ViewMode) {
    if (mode === viewMode) return
    filterTokenRef.current += 1
    setDisplayRows([])
    setListEmptyHint('')
    setViewMode(mode)
  }

  function onMatchOrderChange(mpOrderId: string) {
    const next = mpOrderId || PR_MATCH_RECENT
    if (next !== selectedMatchOrderId) {
      filterTokenRef.current += 1
      clearEnrichedCache()
      setDisplayRows([])
    }
    setSelectedMatchOrderId(next)
    writePrMatchOrderId(prBoard, next)
  }

  function onToggleFavorite(id: string) {
    toggleTalentFavorite(id)
    setFavoriteTick((n) => n + 1)
  }

  async function onChatTap(row: TalentCardRow) {
    if (role !== 'pr') {
      window.alert('请先在「我的」切换为 PR 身份，再向达人发起沟通。')
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
        registryCache,
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

  const categoryLabel =
    prBoard === 'shoot' ? '拍摄分类' : prBoard === 'edit' ? '剪辑分类' : '达人分类'

  return (
    <div className="hall-page pr-recommend-page">
      <header className="pr-recommend-hero">
        <div className="pr-recommend-hero__main">
          <div className="pr-recommend-hero__title-row">
            <h2 className="pr-recommend-hero__title">智能推荐达人</h2>
            <span className="pr-recommend-hero__ai">AI</span>
          </div>
          <p className="pr-recommend-hero__sub">
            基于您的品牌需求和历史合作数据，为您精准推荐优质达人
          </p>
        </div>
        <div className="pr-recommend-hero__picker">
          <PrMatchOrderPicker
            value={selectedMatchOrderId}
            options={matchOrderOptions}
            onChange={onMatchOrderChange}
            label="关联发单（可选）"
          />
        </div>
      </header>

      <div className="pr-recommend-board-bar">
        <div className="pr-recommend-board-tabs" role="tablist">
          {PR_BOARD_SEGMENTS.map((seg) => {
            const Icon = BOARD_ICONS[seg.id]
            return (
              <button
                key={seg.id}
                type="button"
                role="tab"
                aria-selected={prBoard === seg.id}
                className={`pr-recommend-board-tab ${prBoard === seg.id ? 'pr-recommend-board-tab--active' : ''}`}
                onClick={() => onBoardChange(seg.id)}
              >
                <Icon size={16} aria-hidden />
                {seg.label}
              </button>
            )
          })}
        </div>
        <div className="pr-recommend-view-modes" role="group" aria-label="浏览模式">
          <button
            type="button"
            className={`pr-recommend-view-mode${viewMode === 'ai' ? ' pr-recommend-view-mode--active' : ''}`}
            onClick={() => onViewModeChange('ai')}
          >
            AI 智能推荐
          </button>
          <button
            type="button"
            className={`pr-recommend-view-mode${viewMode === 'all' ? ' pr-recommend-view-mode--active' : ''}`}
            onClick={() => onViewModeChange('all')}
          >
            {allModeLabel}
          </button>
        </div>
      </div>

      <div className="pr-recommend-filters">
        <label className="pr-recommend-filter">
          <span>{categoryLabel}</span>
          <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            {TAG_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
        <label className="pr-recommend-filter">
          <span>内容平台</span>
          <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
            {hallFilters.PLATFORM_FILTERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
        <label className="pr-recommend-filter">
          <span>粉丝量级</span>
          <select value={filterFollowers} onChange={(e) => setFilterFollowers(e.target.value)}>
            {FOLLOWER_FILTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
        <label className="pr-recommend-filter">
          <span>达人地域</span>
          <HallCityFilter
            compact
            province={filterProvince}
            city={filterCity}
            onChange={(prov, c) => {
              setFilterProvince(prov)
              setFilterCity(c)
              if (prov === '全部' && c === '全部') clearStoredHallRegion()
              else writeStoredHallRegion(prov, c)
            }}
          />
        </label>
        <label className="pr-recommend-filter">
          <span>平均报价</span>
          <select value={filterQuote} onChange={(e) => setFilterQuote(e.target.value)}>
            {QUOTE_FILTERS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
        <button
          type="button"
          className="pr-recommend-filter pr-recommend-filter--btn"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} aria-hidden />
          更多筛选
        </button>
        <label className="pr-recommend-filter pr-recommend-filter--sort">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="综合排序"
          >
            {SORT_FILTERS.map((s, i) => (
              <option key={s} value={i === 0 ? 'default' : i === 1 ? 'match' : 'followers'}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden />
        </label>
      </div>

      {showMoreFilters ? (
        <div className="pr-recommend-more-filters">
          <label className="pr-recommend-filter">
            <span>性别</span>
            <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
              {GENDER_FILTERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {loading ? <p className="pr-recommend-muted">加载中…</p> : null}
      {matching && viewMode === 'ai' && !displayRows.length ? (
        <p className="pr-recommend-muted">智能匹配中…</p>
      ) : null}
      {err ? <p className="pr-recommend-err">{err}</p> : null}
      {!loading && !matching && listEmptyHint && !displayRows.length ? (
        <EmptyState title="暂无达人" desc={listEmptyHint} />
      ) : null}

      <div className="pr-recommend-grid">
        {displayRows.map((t) => {
          const favorited = isTalentFavorite(t.id)
          void favoriteTick
          return (
          <article key={t.id} className="pr-talent-card surface-card">
            <div className="pr-talent-card__body">
              <div className="pr-talent-card__top">
                <div className="pr-talent-card__identity">
                  <TalentCardAvatar name={t.name} avatar={t.avatar} />
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
                <div
                  className={`pr-talent-card__match${viewMode === 'ai' && (t.matchScore || 0) > 0 ? '' : ' pr-talent-card__match--empty'}`}
                  aria-hidden={viewMode !== 'ai' || !(t.matchScore || 0)}
                >
                  {viewMode === 'ai' && (t.matchScore || 0) > 0 ? (
                    <>
                      <strong>{Math.round(t.matchScore || 0)}%</strong>
                      <span>匹配度</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="pr-talent-card__tags">
                {cardTags(t, viewMode).map((tag) => (
                  <span key={tag} className="pr-talent-card__tag">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="pr-talent-card__advantage">
                <span className="pr-talent-card__advantage-label">AI解读</span>
                <p className="pr-talent-card__advantage-text" title={cardAdvantage(t, viewMode) || '暂无解读'}>
                  {cardAdvantage(t, viewMode) || '暂无解读'}
                </p>
              </div>
            </div>

            <div className="pr-talent-card__actions">
              <button
                type="button"
                className={`pr-talent-card__fav${favorited ? ' is-on' : ''}`}
                onClick={() => onToggleFavorite(t.id)}
                aria-label="收藏"
              >
                <Star size={14} fill={favorited ? 'currentColor' : 'none'} />
                收藏
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
          )
        })}
      </div>

      {!loading && displayRows.length ? <p className="pr-recommend-end">没有更多了</p> : null}
    </div>
  )
}
