import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getActiveRole } from '../../lib/mpSession'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import {
  buildPrMatchOrderOptions,
  matchHintForSelection,
  PR_MATCH_RECENT,
  readPrMatchOrderId,
  writePrMatchOrderId,
  type PrMatchOrderOption,
} from '../../lib/mpRecruitment/prMatchOrderSelect'
import {
  boardAllModeLabel,
  boardEmptyHint,
  boardSearchPlaceholder,
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
import HallCityFilter from './HallCityFilter'
import PrMatchOrderPicker from './PrMatchOrderPicker'
import PageHero from '../ui/PageHero'
import MatchScoreBadge from '../ui/MatchScoreBadge'
import { BtnPrimary, EmptyState, FilterToolbar, StatusTabBar } from '../ui/MockupLayouts'

const TAG_FILTERS = ['全部', '优质', '推荐', '新锐', '会员', '美食', '亲子', '美妆']
const GENDER_FILTERS = ['全部', '男', '女']

type ViewMode = 'ai' | 'all'

function matchTalentSearch(row: TalentCardRow, keyword: string) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  return [row.id, row.name, row.platform, row.region, row.salesGrade, row.quality, ...row.tags]
    .join(' ')
    .toLowerCase()
    .includes(k)
}

type Props = { embedded?: boolean }

export default function RecommendTalentPanel({ embedded = false }: Props) {
  const navigate = useNavigate()
  const role = getActiveRole()
  const [prBoard, setPrBoard] = useState<PrBoardId>('talent')
  const [viewMode, setViewMode] = useState<ViewMode>('ai')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterTag, setFilterTag] = useState('全部')
  const [filterGender, setFilterGender] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [chatLoadingId, setChatLoadingId] = useState('')
  const [err, setErr] = useState('')
  const [allRows, setAllRows] = useState<TalentCardRow[]>([])
  const [displayRows, setDisplayRows] = useState<TalentCardRow[]>([])
  const [listEmptyHint, setListEmptyHint] = useState('')
  const [prBoardOrderCount, setPrBoardOrderCount] = useState(0)
  const [prMatchHint, setPrMatchHint] = useState('发达人招募后，将按发单要求智能推荐达人')
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

  const searchPlaceholder = useMemo(() => boardSearchPlaceholder(prBoard), [prBoard])
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
        const enriched = dedupeTalentRows(
          await recruitmentAi.enrichTalentMatchesForPr(pool, reg, {
            board: prBoard,
            mpOrderId: selectedMatchOrderId,
          }),
        )
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
    const kw = searchKeyword.trim()
    const basePool = poolForBoard(prBoard)
    let filtered = basePool.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))

    if (viewMode === 'all') {
      filtered = dedupeTalentRows(filtered)
        .slice()
        .sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
      if (token !== filterTokenRef.current) return
      let hint = ''
      if (!filtered.length) {
        hint = kw ? `未找到「${kw}」相关结果` : `暂无已注册的${allModeLabel.replace('全部', '')}`
      }
      setDisplayRows(filtered.slice(0, 100))
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
      filtered = enrichedPool.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))
      filtered = filtered.filter((t) => (t.matchScore || 0) >= 60)
    }

    filtered = dedupeTalentRows(filtered).sort(
      (a, b) =>
        (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0),
    )

    if (token !== filterTokenRef.current) return
    let hint = ''
    if (!filtered.length) {
      hint = boardEmptyHint(prBoard, kw, hasMatchOrders)
    }
    setDisplayRows(filtered.slice(0, 50))
    setListEmptyHint(hint)
  }, [
    searchKeyword,
    filterPlatform,
    filterProvince,
    filterCity,
    filterTag,
    filterGender,
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
      setPrMatchHint(matchHintForSelection(board, selected, options, orderCount))
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
    // 仅挂载时拉 registry；切换达人/拍摄/剪辑不再整页重拉，避免与筛选竞态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onBoardChange(id: PrBoardId) {
    if (id === prBoard) return
    filterTokenRef.current += 1
    clearEnrichedCache()
    setDisplayRows([])
    setListEmptyHint('')
    setPrBoard(id)
    setViewMode('ai')
    setSearchKeyword('')
    const pool = boardPools[id] || []
    if (registryCache) {
      syncBoardMeta(id, registryCache, boardPools)
    } else {
      setAllRows(pool)
    }
  }

  function onViewModeChange(next: ViewMode) {
    if (next === viewMode) return
    filterTokenRef.current += 1
    setDisplayRows([])
    setListEmptyHint('')
    setViewMode(next)
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
    setPrMatchHint(matchHintForSelection(prBoard, next, matchOrderOptions, prBoardOrderCount))
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
          `&peerAvatar=${encodeURIComponent(row.avatar || '')}`,
      )
    } catch (e) {
      window.alert(formatChatError(e))
    } finally {
      setChatLoadingId('')
    }
  }

  const listTwoCol = displayRows.length > 1

  return (
    <div className="hall-page space-y-4">
      <PageHero
        title="推荐大厅"
        subtitle={prMatchHint}
        badge="达人匹配"
      />

      <StatusTabBar
        active={prBoard}
        onChange={(id) => onBoardChange(id as PrBoardId)}
        tabs={PR_BOARD_SEGMENTS.map((s) => ({ id: s.id, label: s.label }))}
      />

      <StatusTabBar
        active={viewMode}
        onChange={(id) => onViewModeChange(id as ViewMode)}
        tabs={[
          { id: 'ai', label: '智能匹配' },
          { id: 'all', label: allModeLabel },
        ]}
      />

      {matchOrderOptions.length > 1 ? (
        <PrMatchOrderPicker
          value={selectedMatchOrderId}
          options={matchOrderOptions}
          onChange={onMatchOrderChange}
        />
      ) : null}

      <FilterToolbar
        search={searchKeyword}
        onSearchChange={setSearchKeyword}
        searchPlaceholder={searchPlaceholder}
      >
        <select
          className="filter-toolbar__chip"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>
              {p === '全部' ? '平台' : p}
            </option>
          ))}
        </select>
        <HallCityFilter
          compact
          province={filterProvince}
          city={filterCity}
          onChange={(prov, c) => {
            setFilterProvince(prov)
            setFilterCity(c)
          }}
        />
        <select
          className="filter-toolbar__chip"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          {TAG_FILTERS.map((t) => (
            <option key={t} value={t}>
              {t === '全部' ? '标签' : t}
            </option>
          ))}
        </select>
        {prBoard === 'talent' ? (
          <select
            className="filter-toolbar__chip"
            value={filterGender}
            onChange={(e) => setFilterGender(e.target.value)}
          >
            {GENDER_FILTERS.map((g) => (
              <option key={g} value={g}>
                {g === '全部' ? '性别' : g}
              </option>
            ))}
          </select>
        ) : null}
      </FilterToolbar>

      {loading ? (
        <p className="text-[var(--shell-muted)] text-sm">加载中…</p>
      ) : matching && viewMode === 'ai' && !displayRows.length ? (
        <p className="text-[var(--shell-muted)] text-sm">智能匹配中…</p>
      ) : null}
      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      {listEmptyHint ? <EmptyState title="暂无达人" desc={listEmptyHint} /> : null}

      <div className={`hall-list${listTwoCol ? ' hall-list--two-col' : ''}`}>
        {displayRows.map((t) => (
          <article key={t.id} className="talent-card-mockup surface-card hover-panel">
            {viewMode === 'ai' ? <MatchScoreBadge score={t.matchScore} className="absolute top-3 right-3" /> : null}
            {t.avatar ? (
              <img src={t.avatar} alt="" className="talent-card-mockup__avatar" />
            ) : (
              <div className="talent-card-mockup__avatar talent-card-mockup__avatar--ph">
                {t.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1 pr-14">
              <h3 className="font-semibold truncate text-[var(--shell-text)]">{t.name}</h3>
              <p className="talent-card-meta text-xs mt-1">
                {t.platform} · {t.followers === '团队' ? t.salesGrade : `${t.followers}粉`} · {t.salesGrade}
              </p>
              <p className="talent-card-meta text-xs mt-0.5">{t.region}</p>
              {viewMode === 'ai' && t.aiTag ? (
                <span className="order-tag order-tag--match mt-2 inline-block">{t.aiTag}</span>
              ) : null}
              <div className="mt-2">
                <BtnPrimary
                  onClick={() => void onChatTap(t)}
                  disabled={chatLoadingId === t.id}
                >
                  {chatLoadingId === t.id ? '连接中…' : '沟通'}
                </BtnPrimary>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
