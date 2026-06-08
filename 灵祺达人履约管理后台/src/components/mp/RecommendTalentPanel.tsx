import { useCallback, useEffect, useMemo, useState } from 'react'
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
  type PrBoardId,
} from '../../lib/mpRecruitment/prRecommendBoard'
import type { MpRegistry, TalentCardRow } from '../../lib/mpRecruitment/types'
import { matchTalentFilters } from '../../lib/mpRecruitment/talentFormat'
import {
  canChat,
  ensureSessionWithTalent,
  formatChatError,
  syncProfile,
} from '../../lib/mpSync/talentChat'
import HallCityFilter from './HallCityFilter'
import HallToolbarCard from './HallToolbarCard'
import PrMatchOrderPicker from './PrMatchOrderPicker'
import PageHero from '../ui/PageHero'
import MatchScoreBadge from '../ui/MatchScoreBadge'

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

  const searchPlaceholder = useMemo(() => boardSearchPlaceholder(prBoard), [prBoard])
  const allModeLabel = useMemo(() => boardAllModeLabel(prBoard), [prBoard])

  const applyTalentFilters = useCallback(async () => {
    const f = {
      platform: filterPlatform,
      province: filterProvince,
      city: filterCity,
      tag: filterTag,
      gender: filterGender,
    }
    const kw = searchKeyword.trim()
    let filtered = allRows.filter((r) => matchTalentFilters(r, f) && matchTalentSearch(r, kw))

    if (viewMode === 'all') {
      filtered = filtered.slice().sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
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

    if (hasMatchOrders && registryCache && filtered.length) {
      setMatching(true)
      try {
        filtered = await recruitmentAi.enrichTalentMatchesForPr(filtered, registryCache, {
          board: prBoard,
          mpOrderId: matchOrderId,
        })
        filtered = filtered.filter((t) => (t.matchScore || 0) >= 60)
      } catch {
        const packs = recruitmentAi.resolvePrMatchOrders(registryCache, {
          board: prBoard,
          mpOrderId: matchOrderId,
        })
        const payloads = packs.map((p) => p.payload)
        filtered = filtered
          .map((t) => {
            const fb = recruitmentAi.fallbackTalentScore(t, payloads, prBoard)
            return { ...t, matchScore: fb.score, aiTag: fb.tag, aiTagTone: fb.tone, aiMatch: fb.score >= 55 }
          })
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      } finally {
        setMatching(false)
      }
    } else {
      filtered = filtered.slice().sort((a, b) => (b.followersRaw || 0) - (a.followersRaw || 0))
    }

    filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0) || (b.followersRaw || 0) - (a.followersRaw || 0))

    let hint = ''
    if (!filtered.length) {
      hint = boardEmptyHint(prBoard, kw, hasMatchOrders)
    }
    setDisplayRows(filtered.slice(0, 50))
    setListEmptyHint(hint)
  }, [
    allRows,
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
  ])

  useEffect(() => {
    void applyTalentFilters()
  }, [applyTalentFilters])

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry()
      setRegistryCache(reg)
      const pools = {
        talent: buildBoardPool(reg, 'talent'),
        shoot: buildBoardPool(reg, 'shoot'),
        edit: buildBoardPool(reg, 'edit'),
      }
      setBoardPools(pools)
      const pool = pools[prBoard]
      const orderCount = countPrOrdersForBoard(reg, prBoard)
      const eligible = recruitmentAi.listPrEligibleOrders(reg, { board: prBoard })
      const options = buildPrMatchOrderOptions(eligible)
      let selected = readPrMatchOrderId(prBoard)
      if (selected !== PR_MATCH_RECENT && !options.some((o) => o.id === selected)) {
        selected = PR_MATCH_RECENT
        writePrMatchOrderId(prBoard, PR_MATCH_RECENT)
      }
      setPrBoardOrderCount(orderCount)
      setMatchOrderOptions(options)
      setSelectedMatchOrderId(selected)
      setPrMatchHint(matchHintForSelection(prBoard, selected, options, orderCount))
      setAllRows(pool)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      setDisplayRows([])
    } finally {
      setLoading(false)
    }
  }, [prBoard])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  useEffect(() => {
    const onFocus = () => void loadRegistry()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadRegistry])

  function onBoardChange(id: PrBoardId) {
    if (id === prBoard) return
    const pool = boardPools[id] || []
    const orderCount = registryCache ? countPrOrdersForBoard(registryCache, id) : 0
    const eligible = registryCache ? recruitmentAi.listPrEligibleOrders(registryCache, { board: id }) : []
    const options = buildPrMatchOrderOptions(eligible)
    let selected = readPrMatchOrderId(id)
    if (selected !== PR_MATCH_RECENT && !options.some((o) => o.id === selected)) {
      selected = PR_MATCH_RECENT
      writePrMatchOrderId(id, PR_MATCH_RECENT)
    }
    setPrBoard(id)
    setViewMode('ai')
    setAllRows(pool)
    setPrBoardOrderCount(orderCount)
    setMatchOrderOptions(options)
    setSelectedMatchOrderId(selected)
    setPrMatchHint(matchHintForSelection(id, selected, options, orderCount))
    setSearchKeyword('')
  }

  function onMatchOrderChange(mpOrderId: string) {
    const next = mpOrderId || PR_MATCH_RECENT
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
    <div className="hall-page">
      <HallToolbarCard>
        {embedded ? (
          <PageHero inset title="推荐大厅" subtitle={prMatchHint} badge="达人匹配" />
        ) : (
          <div>
            <h2 className="text-xl font-bold text-[var(--shell-text)]">推荐大厅</h2>
            <p className="text-sm text-[var(--shell-muted)] mt-1">{prMatchHint}</p>
          </div>
        )}

        <input
          className="hall-search-input panel-input"
          placeholder={searchPlaceholder}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />

        <div className="hall-segment-block">
        <div className="hall-segment-group">
          <span className="hall-field-label">需求身份</span>
          <div className="hall-segment-row">
            {PR_BOARD_SEGMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${prBoard === s.id ? 'panel-tab-active' : 'panel-tab'}`}
                onClick={() => onBoardChange(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="hall-segment-group">
          <span className="hall-field-label">浏览模式</span>
          <div className="hall-segment-row">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'ai' ? 'panel-tab-active' : 'panel-tab'}`}
              onClick={() => setViewMode('ai')}
            >
              智能匹配
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'all' ? 'panel-tab-active' : 'panel-tab'}`}
              onClick={() => setViewMode('all')}
            >
              {allModeLabel}
            </button>
          </div>
        </div>
      </div>

      {matchOrderOptions.length > 1 ? (
        <PrMatchOrderPicker
          value={selectedMatchOrderId}
          options={matchOrderOptions}
          onChange={onMatchOrderChange}
        />
      ) : null}

      <div className="hall-filter-row">
        <select
          className="rounded-lg panel-select px-2 py-1.5"
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
          className="rounded-lg panel-select px-2 py-1.5"
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
            className="rounded-lg panel-select px-2 py-1.5"
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
      </div>
      </HallToolbarCard>

      {loading || matching ? (
        <p className="text-[var(--shell-muted)] text-sm">{matching ? '智能匹配中…' : '加载中…'}</p>
      ) : null}
      {err ? <p className="text-red-400 text-sm">{err}</p> : null}
      {listEmptyHint ? <p className="text-[var(--shell-muted)] text-sm">{listEmptyHint}</p> : null}

      <div className={`hall-list${listTwoCol ? ' hall-list--two-col' : ''}`}>
        {displayRows.map((t) => (
          <article key={t.id} className="talent-card rounded-xl border p-4 flex gap-3 relative hover-panel">
            {viewMode === 'ai' ? <MatchScoreBadge score={t.matchScore} className="absolute top-3 right-3" /> : null}
            {t.avatar ? (
              <img src={t.avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-lg shrink-0">
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
              <button
                type="button"
                className="mt-2 px-3 py-1 rounded-lg text-xs font-medium bg-[#07c160] text-white hover:bg-[#06ad56] disabled:opacity-50 transition-colors"
                disabled={chatLoadingId === t.id}
                onClick={() => void onChatTap(t)}
              >
                {chatLoadingId === t.id ? '连接中…' : '沟通'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
