import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Calendar, LayoutGrid, List, RotateCcw } from 'lucide-react'
import { fetchMpRegistry, deleteMpRecruitmentOrder, patchMpRecruitmentOrder, patchPrOrderWorkflow, clearMpRegistryCache } from '../lib/mpApi'
import * as hallFilters from '../lib/mpRecruitment/hallFilters'
import * as listFilters from '../lib/mpRecruitment/listFilters'
import { HALL_DEFAULT_STATUS_FILTER, matchHallStatusFilter } from '../lib/mpRecruitment/mpOrderStatus'
import { matchListKeyword } from '../lib/mpRecruitment/listKeywordSearch'
import {
  cachePublishedOrdersFromMpList,
  markPublishedOrderDeleted,
  readPublishedOrders,
  listPublishedOrdersForCurrentPr,
  pruneOrphanPublishedOrders,
  touchPublishedOrderSnapshot,
} from '../lib/mpRecruitment/publishedOrders'
import { syncClientStateWithServer } from '../lib/mpAccountClientSync'
import {
  deletePublishDraft,
  draftDisplayTitle,
  formatDraftSavedAt,
  listPublishDrafts,
  type PublishWizardDraft,
} from '../lib/mpSync/publishDraft'
import { DELIVERY_WINDOWS } from '../lib/mpSync/publishFormOptions'
import { prepareRecruitmentSharePayload } from '../lib/mpSync/recruitmentShareCopy'
import { readPrProfile } from '../lib/mpSync/userProfile'
import { EmptyState, StatusTabBar } from '../components/ui/MockupLayouts'
import PrOrderCard, { PrOrderActionBtn, PrOrderShareBtn } from '../components/mp/PrOrderCard'
import RecruitmentShareSheet from '../components/mp/RecruitmentShareSheet'
import { countPendingVideos, countVideos } from '../lib/mpRecruitment/prOrderVideoCounts'
import {
  PR_WORKFLOW_TABS,
  buildSkipSchedulePatch,
  buildSkipVideoReviewPatch,
  buildScheduleCompletedPatch,
  resolvePrWorkflowStage,
  countPendingScripts,
  type PrOrdersTabId,
  type PrWorkflowStage,
} from '../lib/mpRecruitment/prOrderWorkflowStage'
import {
  matchPrPlatformGroup,
  PR_PLATFORM_GROUP_OPTIONS,
  isScriptReviewPlatform,
  type PrDeliveryPlatformGroup,
} from '../lib/mpRecruitment/deliveryReviewPlatform'
import { shouldHidePrPublishedRow } from '../lib/mpRecruitment/inactiveMpRecruitmentOrder'
import { isVisitPlanDatesConfirmed } from '../lib/mpSync/visitScheduleRuntime'
import { buildInviteProgressLabel, isTargetedOrder } from '../lib/mpSync/mpTargetedRecruit'
import { finalizeIfNeeded } from '../lib/mpSync/mpTargetedRecruitApi'

type Tab = PrOrdersTabId
type SortKey = 'latest' | 'earliest' | 'applicants'
type ViewMode = 'list' | 'grid'
type PublishedScope = 'open' | 'targeted'

const PUBLISHED_SCOPE_OPTIONS: { id: PublishedScope; label: string }[] = [
  { id: 'open', label: '普通招募' },
  { id: 'targeted', label: '定向邀约' },
]

const PR_ORDER_STATUS_FILTERS = [
  { value: HALL_DEFAULT_STATUS_FILTER, label: '招募中/收集中' },
  { value: '全部', label: '全部状态' },
  { value: '招募中', label: '招募中' },
  { value: '收集中', label: '收集中' },
  { value: '已截止', label: '已截止' },
  { value: '已停止', label: '已停止' },
  { value: '已完成', label: '已完成' },
] as const

type PrOrderRow = ReturnType<typeof listFilters.enrichMpOrderListItem> & {
  mpOrderId: string
  hallLabel: string
  platform: string
  region: string
  category: string
  recruitTarget: 'talent' | 'shoot' | 'edit'
  mp: Record<string, unknown> | null
  isRemovedFromRegistry: boolean
  isDeleted: boolean
  deletedAt?: string
  publishedAt?: string
  pendingVideoCount: number
  pendingScriptCount: number
  pendingReviewCount: number
  isScriptOrder: boolean
  reviewPath: string
  videoCount: number
  status: string
  statusLabel: string
  deadlineMs: number
  recruiting: boolean
  workflowStage: PrWorkflowStage
}

function isStoppedOrderRow(row: Pick<PrOrderRow, 'status' | 'statusLabel'>): boolean {
  return row.status === 'closed' || row.statusLabel === '已停止'
}

function isSignupDeadlinePassed(row: Pick<PrOrderRow, 'deadlineMs' | 'status' | 'statusLabel'>): boolean {
  const deadlineMs = row.deadlineMs || 0
  if (deadlineMs > 0 && Date.now() >= deadlineMs) return true
  return row.status === 'expired' || row.statusLabel === '已截止'
}

function deliveryWindowLabel(id: string) {
  return DELIVERY_WINDOWS.find((w) => w.id === id)?.label || '招募大厅'
}

function recruitTargetLabel(t: string) {
  if (t === 'shoot') return '拍摄'
  if (t === 'edit') return '剪辑'
  return '达人'
}

function orderCoverUrl(mp: Record<string, unknown> | null): string | undefined {
  const url = String(mp?.coverImage || mp?.coverUrl || '').trim()
  return url || undefined
}

function formatPrOrderDate(raw: string | undefined): string {
  const t = Date.parse(String(raw || '').replace(/\//g, '-'))
  if (!t) return raw || '—'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function resolvePublishedAt(mp: Record<string, unknown> | null, fallback?: string): string {
  const raw = String(mp?.createdAt || mp?.updatedAt || fallback || '').trim()
  return formatPrOrderDate(raw)
}

function resolveBudgetText(mp: Record<string, unknown> | null): string {
  const text = String(mp?.budgetText || '').trim()
  if (text) return text
  const amount = Number(mp?.priceAmount || 0)
  if (amount > 0) return `¥${amount}`
  return '面议'
}

function buildOrderTags(row: PrOrderRow): string[] {
  const tags = [row.category, row.hallLabel, recruitTargetLabel(row.recruitTarget), row.platform].filter(
    (t) => t && t !== '—' && t !== '本地生活',
  )
  const talentTags = row.mp?.talentTags
  if (Array.isArray(talentTags)) {
    for (const t of talentTags) {
      const s = String(t || '').trim()
      if (s && !tags.includes(s)) tags.push(s)
    }
  }
  return tags.slice(0, 4)
}

function matchPublishedDate(
  mp: Record<string, unknown> | null,
  fallback: string | undefined,
  filterDate: string,
): boolean {
  if (!filterDate) return true
  return resolvePublishedAt(mp, fallback) === filterDate
}

export default function PrOrdersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const tabParam = search.get('tab')
  const tab: Tab =
    tabParam && PR_WORKFLOW_TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'published'
  const platformGroupParam = search.get('platformGroup')
  const platformGroup: PrDeliveryPlatformGroup =
    platformGroupParam === 'script' ? 'script' : 'video'

  const setPlatformGroup = (group: PrDeliveryPlatformGroup) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (group === 'video') next.delete('platformGroup')
        else next.set('platformGroup', group)
        return next
      },
      { replace: true },
    )
  }

  const [rows, setRows] = useState<PrOrderRow[]>([])
  const [drafts, setDrafts] = useState<PublishWizardDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [togglingId, setTogglingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [workflowBusyId, setWorkflowBusyId] = useState('')
  const [sharingId, setSharingId] = useState('')
  const [shareSheet, setShareSheet] = useState<{ text: string; title: string; order: Record<string, unknown> } | null>(null)
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterStatus, setFilterStatus] = useState<string>(HALL_DEFAULT_STATUS_FILTER)
  const [filterKeyword, setFilterKeyword] = useState('')
  const [filterPublishedDate, setFilterPublishedDate] = useState('')
  const [publishedScope, setPublishedScope] = useState<PublishedScope>('open')
  const [sortKey, setSortKey] = useState<SortKey>('latest')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [listPage, setListPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('')
  const publishDateRef = useRef<HTMLInputElement>(null)
  const pageSize = 10

  const refreshDrafts = useCallback(() => {
    setDrafts(listPublishDrafts())
  }, [])

  async function loadPublished() {
    setErr('')
    try {
      await syncClientStateWithServer().catch(() => null)
      const reg = await fetchMpRegistry({ includePrOwned: true })
      const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
        string,
        unknown
      >[]
      cachePublishedOrdersFromMpList(mpList)
      pruneOrphanPublishedOrders(mpList)
      const local = listPublishedOrdersForCurrentPr(mpList)
      if (!local.length) {
        setRows([])
        return
      }
      setRows(
        local.map((item) => {
          const mp = mpList.find((o) => o && o.id === item.mpOrderId) as Record<string, unknown> | undefined
          if (mp && isTargetedOrder(mp)) {
            void finalizeIfNeeded(item.mpOrderId).catch(() => null)
          }
          if (mp && !item.deletedAt) {
            touchPublishedOrderSnapshot(item.mpOrderId, {
              title: String(mp.title || mp.customerName || item.title || item.mpOrderId),
              lastStatus: String(mp.status || 'open'),
              hall: mp.hall === 'urgent' || mp.urgent ? 'urgent' : mp.hall === 'ice' || mp.orderKind === 'ice' ? 'ice' : 'normal',
            })
          }
          const enriched = listFilters.enrichMpOrderListItem(mp || null, item)
          const platform = String(enriched.platform || mp?.platform || '抖音')
          const isScriptOrder = isScriptReviewPlatform(platform)
          const pendingVideoCount = countPendingVideos(mp || null)
          const pendingScriptCount = countPendingScripts(mp || null)
          return {
            ...enriched,
            mpOrderId: item.mpOrderId,
            hallLabel: enriched.hallLabel as string,
            platform,
            region: String(mp?.region || mp?.storeName || ''),
            category: String(mp?.category || '本地生活'),
            recruitTarget: enriched.recruitTarget as 'talent' | 'shoot' | 'edit',
            mp: mp || null,
            isRemovedFromRegistry: Boolean(enriched.isRemovedFromRegistry),
            isDeleted: Boolean(enriched.isDeleted),
            deletedAt: item.deletedAt,
            pendingVideoCount,
            pendingScriptCount,
            pendingReviewCount: isScriptOrder ? pendingScriptCount : pendingVideoCount,
            isScriptOrder,
            reviewPath: isScriptOrder ? 'script-review' : 'video-review',
            videoCount: countVideos(mp || null),
            workflowStage: resolvePrWorkflowStage(mp || null),
          }
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      const fallback = readPublishedOrders()
      setRows(
        fallback.map((item) => {
          const enriched = listFilters.enrichMpOrderListItem(null, item)
          return {
            ...enriched,
            mpOrderId: item.mpOrderId,
            hallLabel: enriched.hallLabel as string,
            platform: '抖音',
            region: '',
            category: '本地生活',
            recruitTarget: 'talent' as const,
            mp: null,
            isRemovedFromRegistry: Boolean(enriched.isRemovedFromRegistry),
            isDeleted: Boolean(enriched.isDeleted),
            deletedAt: item.deletedAt,
            pendingVideoCount: 0,
            pendingScriptCount: 0,
            pendingReviewCount: 0,
            isScriptOrder: false,
            reviewPath: 'video-review',
            videoCount: 0,
            workflowStage: 'recruiting' as const,
          }
        }),
      )
    }
  }

  async function load() {
    setLoading(true)
    refreshDrafts()
    await loadPublished()
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [refreshDrafts])

  const platformFilteredRows = useMemo(
    () => rows.filter((row) => matchPrPlatformGroup(row.platform, platformGroup)),
    [rows, platformGroup],
  )

  const {
    recruitingRows,
    pendingScheduleRows,
    pendingVideoRows,
    completedRows,
    stoppedRows,
    deletedRows,
  } = useMemo(() => {
    const recruiting: PrOrderRow[] = []
    const pendingSchedule: PrOrderRow[] = []
    const pendingVideo: PrOrderRow[] = []
    const completed: PrOrderRow[] = []
    const stopped: PrOrderRow[] = []
    const deleted: PrOrderRow[] = []
    for (const row of platformFilteredRows) {
      if (row.isDeleted || row.deletedAt) deleted.push(row)
      else if (isStoppedOrderRow(row)) stopped.push(row)
      else {
        const stage = row.workflowStage || resolvePrWorkflowStage(row.mp)
        if (stage === 'pending_schedule') pendingSchedule.push(row)
        else if (stage === 'pending_video_review' || stage === 'pending_script_review') pendingVideo.push(row)
        else if (stage === 'completed') completed.push(row)
        else if (!shouldHidePrPublishedRow(row)) recruiting.push(row)
      }
    }
    deleted.sort((a, b) => {
      const ta = Date.parse(String(a.deletedAt || '').replace(/\//g, '-')) || 0
      const tb = Date.parse(String(b.deletedAt || '').replace(/\//g, '-')) || 0
      return tb - ta
    })
    return {
      recruitingRows: recruiting,
      pendingScheduleRows: pendingSchedule,
      pendingVideoRows: pendingVideo,
      completedRows: completed,
      stoppedRows: stopped,
      deletedRows: deleted,
    }
  }, [platformFilteredRows])

  const { publishedOpenCount, publishedTargetedCount } = useMemo(() => {
    let openCount = 0
    let targetedCount = 0
    for (const row of recruitingRows) {
      if (isTargetedOrder(row.mp)) targetedCount += 1
      else openCount += 1
    }
    return { publishedOpenCount: openCount, publishedTargetedCount: targetedCount }
  }, [recruitingRows])

  const tabSourceRows = useMemo(() => {
    if (tab === 'deleted') return deletedRows
    if (tab === 'stopped') return stoppedRows
    if (tab === 'pending_schedule') return pendingScheduleRows
    if (tab === 'pending_video_review') return pendingVideoRows
    if (tab === 'completed') return completedRows
    return recruitingRows
  }, [
    tab,
    deletedRows,
    stoppedRows,
    pendingScheduleRows,
    pendingVideoRows,
    completedRows,
    recruitingRows,
  ])

  const filteredRows = useMemo(() => {
    const source = tabSourceRows
    const rows = source.filter((row) => {
      if (tab === 'published') {
        const targeted = isTargetedOrder(row.mp)
        if (publishedScope === 'targeted' ? !targeted : targeted) return false
        if (shouldHidePrPublishedRow(row as Record<string, unknown>)) return false
        if (!hallFilters.matchCategory(row.category, filterCategory)) return false
        if (filterStatus === HALL_DEFAULT_STATUS_FILTER && row.isRemovedFromRegistry) return false
        if (!matchHallStatusFilter(String(row.statusLabel || ''), filterStatus)) return false
        if (!matchPublishedDate(row.mp, row.publishedAt, filterPublishedDate)) return false
      }
      if (!matchListKeyword(row as Record<string, unknown>, filterKeyword)) return false
      return true
    })
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortKey === 'applicants') return (b.applicantCount || 0) - (a.applicantCount || 0)
      const ta = Date.parse(String(a.mp?.createdAt || a.publishedAt || '').replace(/\//g, '-')) || 0
      const tb = Date.parse(String(b.mp?.createdAt || b.publishedAt || '').replace(/\//g, '-')) || 0
      return sortKey === 'earliest' ? ta - tb : tb - ta
    })
    return sorted
  }, [tabSourceRows, tab, publishedScope, filterCategory, filterStatus, filterKeyword, filterPublishedDate, sortKey])

  const filteredDrafts = useMemo(() => {
    const kw = filterKeyword.trim()
    if (!kw) return drafts
    return drafts.filter((draft) =>
      matchListKeyword(
        {
          title: draftDisplayTitle(draft),
          recruitModeLabel: draft.recruitModeLabel,
        },
        kw,
        [draft.form?.title, draft.form?.shootLocation, ...(draft.form?.selectedCities || [])],
      ),
    )
  }, [drafts, filterKeyword])

  useEffect(() => {
    setListPage(1)
  }, [tab, platformGroup, publishedScope, filterKeyword, filterCategory, filterStatus, filterPublishedDate, sortKey])

  const listCount = tab === 'drafts' ? filteredDrafts.length : filteredRows.length
  const totalPages = Math.max(1, Math.ceil(listCount / pageSize))
  const pagedRows = filteredRows.slice((listPage - 1) * pageSize, listPage * pageSize)
  const pagedDrafts = filteredDrafts.slice((listPage - 1) * pageSize, listPage * pageSize)

  function resetFilters() {
    setFilterKeyword('')
    setFilterCategory('全部')
    setFilterStatus(HALL_DEFAULT_STATUS_FILTER)
    setFilterPublishedDate('')
    setSortKey('latest')
    setListPage(1)
  }

  function openPublishDatePicker() {
    const el = publishDateRef.current
    if (!el) return
    try {
      el.showPicker?.()
    } catch {
      el.click()
    }
  }

  function setTab(next: Tab) {
    if (next === 'published') setPublishedScope('open')
    setSearch(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        if (next === 'published') nextParams.delete('tab')
        else nextParams.set('tab', next)
        return nextParams
      },
      { replace: true },
    )
  }

  function onDeleteDraft(id: string) {
    if (!confirm('确定删除该草稿？删除后不可恢复。')) return
    deletePublishDraft(id)
    refreshDrafts()
  }

  async function onShare(row: PrOrderRow) {
    if (sharingId) return
    const order = row.mp || {
      id: row.mpOrderId,
      title: row.title,
      region: '全国',
      recruitmentInfo: '',
    }
    setSharingId(row.mpOrderId)
    try {
      const payload = await prepareRecruitmentSharePayload(order as Record<string, unknown>, readPrProfile())
      setShareSheet(payload)
    } catch (e) {
      alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharingId('')
    }
  }

  async function onSkipSchedule(row: PrOrderRow) {
    if (!row.mp || workflowBusyId) return
    const nextLabel = row.isScriptOrder ? '待文稿审核' : '待视频审核'
    if (!confirm(`确认跳过探店排期？订单将直接进入「${nextLabel}」。`)) return
    setWorkflowBusyId(row.mpOrderId)
    try {
      await patchPrOrderWorkflow(row.mp, buildSkipSchedulePatch(row.mp))
      clearMpRegistryCache()
      await loadPublished()
      setTab('pending_video_review')
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setWorkflowBusyId('')
    }
  }

  async function onSkipVideoReview(row: PrOrderRow) {
    if (!row.mp || workflowBusyId) return
    if (!confirm('确认跳过视频审核？订单将标记为已完成。')) return
    setWorkflowBusyId(row.mpOrderId)
    try {
      await patchPrOrderWorkflow(row.mp, buildSkipVideoReviewPatch(), 'done')
      clearMpRegistryCache()
      await loadPublished()
      setTab('completed')
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setWorkflowBusyId('')
    }
  }

  async function onToggle(row: PrOrderRow) {
    if (!row.canToggleRecruit || togglingId) return
    const next = row.toggleNextStatus as string
    if (next === 'open' && isSignupDeadlinePassed(row)) {
      alert('报名截止日期已过，请先修改报名截止日期后再开始招募。')
      navigate(`/publish?edit=${encodeURIComponent(row.mpOrderId)}`)
      return
    }
    if (!confirm(next === 'closed' ? '停止后达人将无法继续报名，已报名数据保留。' : '开始后将在招募大厅重新展示并恢复招募中/收集中。')) return
    setTogglingId(row.mpOrderId)
    try {
      await patchMpRecruitmentOrder({ id: row.mpOrderId, status: next })
      await loadPublished()
      setTab(next === 'closed' ? 'stopped' : 'published')
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败')
    } finally {
      setTogglingId('')
    }
  }

  async function onDeletePublished(row: PrOrderRow) {
    if (deletingId) return
    if (!confirm('删除后达人将无法在招募大厅看到该单，已报名信息将一并移除。确定删除？')) return
    setDeletingId(row.mpOrderId)
    try {
      await deleteMpRecruitmentOrder(row.mpOrderId)
      markPublishedOrderDeleted(row.mpOrderId)
      clearMpRegistryCache()
      await loadPublished()
      setTab('deleted')
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="page-content-shell page-content-shell--wide pr-orders-page">
      <div className="pr-orders-platform-group pr-orders-platform-group--page">
        {PR_PLATFORM_GROUP_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pr-orders-platform-chip${platformGroup === opt.id ? ' pr-orders-platform-chip--on' : ''}`}
            onClick={() => setPlatformGroup(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="pr-orders-shell surface-card">
        <StatusTabBar
          active={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: 'published', label: '已发布', count: recruitingRows.length },
            { id: 'pending_schedule', label: '待排期', count: pendingScheduleRows.length },
            {
              id: 'pending_video_review',
              label: platformGroup === 'script' ? '待文稿审核' : '待视频审核',
              count: pendingVideoRows.length,
            },
            { id: 'completed', label: '已完成', count: completedRows.length },
            { id: 'drafts', label: '草稿箱', count: drafts.length },
            { id: 'stopped', label: '已停止', count: stoppedRows.length },
            { id: 'deleted', label: '已删除', count: deletedRows.length },
          ]}
        />

        {tab === 'published' && recruitingRows.length > 0 ? (
          <div className="pr-orders-platform-group pr-orders-platform-group--page">
            {PUBLISHED_SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`pr-orders-platform-chip ${publishedScope === opt.id ? 'pr-orders-platform-chip--on' : ''}`}
                onClick={() => setPublishedScope(opt.id)}
              >
                {opt.label}
                {opt.id === 'open' && publishedOpenCount > 0 ? ` (${publishedOpenCount})` : null}
                {opt.id === 'targeted' && publishedTargetedCount > 0 ? ` (${publishedTargetedCount})` : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="pr-orders-toolbar">
          <div className="pr-orders-toolbar__search">
            <span className="pr-orders-toolbar__search-icon" aria-hidden>⌕</span>
            <input
              className="pr-orders-toolbar__input"
              placeholder="关键词、商单编号"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
            />
          </div>
          {tab === 'published' ? (
            <>
              <select
                className="pr-orders-toolbar__select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                {hallFilters.CATEGORY_FILTERS.map((c) => (
                  <option key={c} value={c}>
                    {c === '全部' ? '标签分类' : c}
                  </option>
                ))}
              </select>
              <select
                className="pr-orders-toolbar__select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                {PR_ORDER_STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value === HALL_DEFAULT_STATUS_FILTER ? '招募状态' : s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`pr-orders-toolbar__date${filterPublishedDate ? ' pr-orders-toolbar__date--on' : ''}`}
                onClick={openPublishDatePicker}
              >
                <Calendar size={15} aria-hidden />
                <span>{filterPublishedDate || '发布时间'}</span>
                <input
                  ref={publishDateRef}
                  type="date"
                  className="pr-orders-toolbar__date-input"
                  value={filterPublishedDate}
                  onChange={(e) => setFilterPublishedDate(e.target.value)}
                  aria-label="发布时间"
                  tabIndex={-1}
                />
              </button>
            </>
          ) : null}
          <button type="button" className="pr-orders-toolbar__reset" onClick={resetFilters}>
            <RotateCcw size={14} aria-hidden />
            重置
          </button>
          <Link to="/publish" className="pr-orders-toolbar__publish">
            发起招募
          </Link>
        </div>

        <div className="pr-orders-list-head">
          <span>
            共{' '}
            {tab === 'drafts'
              ? filteredDrafts.length
              : filteredRows.length}{' '}
            条
          </span>
          <div className="pr-orders-list-head__right">
            <select
              className="pr-orders-toolbar__select pr-orders-toolbar__select--sm"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="latest">最新发布</option>
              <option value="earliest">最早发布</option>
              <option value="applicants">报名最多</option>
            </select>
            <div className="pr-orders-view-toggle" role="group" aria-label="视图切换">
              <button
                type="button"
                className={viewMode === 'list' ? 'is-on' : ''}
                onClick={() => setViewMode('list')}
                aria-label="列表视图"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                className={viewMode === 'grid' ? 'is-on' : ''}
                onClick={() => setViewMode('grid')}
                aria-label="网格视图"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="pr-orders-body">
          {loading ? <p className="pr-orders-muted">加载中…</p> : null}
          {err && (tab !== 'drafts' && tab !== 'deleted') ? (
            <p className="pr-orders-err">{err}</p>
          ) : null}

          {tab === 'published' ||
          tab === 'pending_schedule' ||
          tab === 'pending_video_review' ||
          tab === 'completed' ||
          tab === 'stopped' ? (
            <>
              {!loading && tab === 'published' && recruitingRows.length && !filteredRows.length ? (
                <EmptyState
                  title={publishedScope === 'targeted' ? '暂无定向邀约发单' : '暂无普通招募发单'}
                  desc={
                    publishedScope === 'targeted'
                      ? '发布定向邀约并通知达人后，订单会显示在这里。'
                      : '发布普通招募后，订单会显示在这里。'
                  }
                />
              ) : null}
              {!loading && tab === 'published' && !recruitingRows.length ? (
                <EmptyState title="暂无招募中发单" desc="发布招募并通知已选达人后，订单会自动进入待排期。" />
              ) : null}
              {!loading && tab === 'pending_schedule' && !pendingScheduleRows.length ? (
                <EmptyState title="暂无待排期发单" desc="通知已选达人后，探店类订单会出现在此处，可设置可探店日期并排期。" />
              ) : null}
              {!loading && tab === 'pending_video_review' && !pendingVideoRows.length ? (
                <EmptyState title="暂无待审片发单" desc="完成探店排期或点击「不排期」后，订单会移入此处。" />
              ) : null}
              {!loading && tab === 'completed' && !completedRows.length ? (
                <EmptyState title="暂无已完成发单" desc="视频审核通过或跳过审核后，订单会出现在此处。" />
              ) : null}
              {!loading && tab === 'stopped' && !stoppedRows.length ? (
                <EmptyState title="暂无已停止发单" desc="在已发布发单中点击「停止招募」后会移入此处。" />
              ) : null}
              {!loading && tabSourceRows.length && !filteredRows.length ? (
                <EmptyState title="暂无匹配发单" desc="可调整筛选条件或点击重置。" />
              ) : null}
              <div className={`pr-orders-list${viewMode === 'grid' ? ' pr-orders-list--grid' : ''}`}>
                {pagedRows.map((row) => {
                  const deleteBtn = (
                    <PrOrderActionBtn
                      danger
                      disabled={deletingId === row.mpOrderId}
                      onClick={() => void onDeletePublished(row)}
                    >
                      {deletingId === row.mpOrderId ? '删除中…' : '删除'}
                    </PrOrderActionBtn>
                  )

                  return (
                  <PrOrderCard
                    key={row.mpOrderId}
                    dimmed={row.isRemovedFromRegistry}
                    cover={orderCoverUrl(row.mp)}
                    title={row.title}
                    region={row.region || '全国'}
                    category={row.category}
                    recruitTarget={recruitTargetLabel(row.recruitTarget)}
                    budgetText={resolveBudgetText(row.mp)}
                    orderNo={row.mpOrderId}
                    publishedAt={resolvePublishedAt(row.mp, row.publishedAt)}
                    tags={buildOrderTags(row)}
                    statusLabel={row.statusLabel}
                    recruiting={row.recruiting}
                    applicantCount={row.applicantCount}
                    viewCount={Number(row.mp?.viewCount || 0)}
                    favoriteCount={Number(row.mp?.favoriteCount || 0)}
                    actions={
                      !row.isRemovedFromRegistry ? (
                        tab === 'pending_schedule' ? (
                          <>
                            <Link
                              to={
                                isVisitPlanDatesConfirmed(row.mp)
                                  ? `/orders/${encodeURIComponent(row.mpOrderId)}/schedule`
                                  : `/orders/${encodeURIComponent(row.mpOrderId)}/schedule/dates`
                              }
                              className="pr-order-action pr-order-action--primary"
                            >
                              {isVisitPlanDatesConfirmed(row.mp) ? '进入排期' : '设置可探店日期'}
                            </Link>
                            <PrOrderActionBtn
                              disabled={workflowBusyId === row.mpOrderId}
                              onClick={() => void onSkipSchedule(row)}
                            >
                              {workflowBusyId === row.mpOrderId ? '处理中…' : '不排期'}
                            </PrOrderActionBtn>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}
                              className="pr-order-action"
                            >
                              报名管理
                            </Link>
                            {deleteBtn}
                          </>
                        ) : tab === 'pending_video_review' ? (
                          <>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/schedule?view=review`}
                              className="pr-order-action"
                            >
                              查看/修改排期
                            </Link>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/${row.reviewPath}`}
                              className="pr-order-action pr-order-action--primary"
                            >
                              进入审核{row.pendingReviewCount > 0 ? ` (${row.pendingReviewCount})` : row.videoCount > 0 && !row.isScriptOrder ? ` (${row.videoCount})` : ''}
                            </Link>
                            <PrOrderActionBtn
                              disabled={workflowBusyId === row.mpOrderId}
                              onClick={() => void onSkipVideoReview(row)}
                            >
                              {workflowBusyId === row.mpOrderId ? '处理中…' : '不审核'}
                            </PrOrderActionBtn>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}
                              className="pr-order-action"
                            >
                              报名管理
                            </Link>
                            {deleteBtn}
                          </>
                        ) : tab === 'completed' ? (
                          <>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants?view=selected`}
                              className="pr-order-action pr-order-action--primary"
                            >
                              查看明细
                            </Link>
                            <Link
                              to={`/orders/${encodeURIComponent(row.mpOrderId)}/${row.reviewPath}?from=completed`}
                              className="pr-order-action"
                            >
                              {row.isScriptOrder ? '查看文稿' : '查看成片'}
                            </Link>
                            <PrOrderShareBtn
                              disabled={sharingId === row.mpOrderId}
                              onClick={() => void onShare(row)}
                            >
                              {sharingId === row.mpOrderId ? '生成中…' : '分享'}
                            </PrOrderShareBtn>
                            {deleteBtn}
                          </>
                        ) : (
                          <>
                            {isTargetedOrder(row.mp) ? (
                              <>
                                <Link
                                  to={`/orders/${encodeURIComponent(row.mpOrderId)}/targeted`}
                                  className="pr-order-action pr-order-action--primary"
                                >
                                  邀约管理
                                </Link>
                                <span className="pr-orders-muted text-xs self-center">
                                  {buildInviteProgressLabel(row.mp)}
                                </span>
                              </>
                            ) : (
                              <Link
                                to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}
                                className="pr-order-action pr-order-action--primary"
                              >
                                报名管理
                              </Link>
                            )}
                            <Link
                              to={`/publish?edit=${encodeURIComponent(row.mpOrderId)}`}
                              className="pr-order-action"
                            >
                              编辑招募
                            </Link>
                            <PrOrderShareBtn
                              disabled={sharingId === row.mpOrderId}
                              onClick={() => void onShare(row)}
                            >
                              {sharingId === row.mpOrderId ? '生成中…' : '分享'}
                            </PrOrderShareBtn>
                            {row.canToggleRecruit ? (
                              <PrOrderActionBtn
                                danger
                                disabled={togglingId === row.mpOrderId}
                                onClick={() => void onToggle(row)}
                              >
                                {row.toggleActionLabel}招募
                              </PrOrderActionBtn>
                            ) : null}
                            {deleteBtn}
                          </>
                        )
                      ) : (
                        <p className="pr-orders-muted">该发单未同步，仅保留历史记录</p>
                      )
                    }
                  />
                  )
                })}
              </div>
            </>
          ) : tab === 'deleted' ? (
            <>
              {!loading && !deletedRows.length ? (
                <EmptyState title="暂无已删除发单" desc="删除的发单会保留在此处便于查阅。" />
              ) : null}
              {!loading && deletedRows.length && !filteredRows.length ? (
                <EmptyState title="暂无匹配记录" desc="可调整搜索关键词。" />
              ) : null}
              <div className="pr-orders-list">
                {pagedRows.map((row) => (
                  <PrOrderCard
                    key={row.mpOrderId}
                    dimmed
                    title={row.title}
                    region={row.region || '全国'}
                    category={row.category}
                    recruitTarget={recruitTargetLabel(row.recruitTarget)}
                    budgetText={resolveBudgetText(row.mp)}
                    orderNo={row.mpOrderId}
                    publishedAt={row.deletedAt ? `删除于 ${formatPrOrderDate(row.deletedAt)}` : '—'}
                    tags={buildOrderTags(row)}
                    statusLabel="已删除"
                    recruiting={false}
                    applicantCount={row.applicantCount}
                    actions={<p className="pr-orders-muted">已从招募大厅移除</p>}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {!loading && !drafts.length ? (
                <EmptyState title="草稿箱为空" desc="在发布招募页保存草稿后会出现在此处。" />
              ) : null}
              {!loading && drafts.length && !filteredDrafts.length ? (
                <EmptyState title="暂无匹配草稿" desc="可调整搜索关键词。" />
              ) : null}
              <div className="pr-orders-list">
                {pagedDrafts.map((draft) => (
                  <article key={draft.id} className="pr-order-draft surface-card">
                    <div>
                      <span className="pr-order-draft__badge">草稿</span>
                      <h3 className="pr-order-draft__title">{draftDisplayTitle(draft)}</h3>
                      <p className="pr-orders-muted">
                        {draft.recruitModeLabel || '招募'} · {deliveryWindowLabel(draft.form.deliveryWindow)} ·
                        保存于 {formatDraftSavedAt(draft.savedAt)}
                      </p>
                    </div>
                    <div className="pr-order-draft__actions">
                      <Link to={`/publish?draft=${encodeURIComponent(draft.id)}`} className="pr-order-action pr-order-action--primary">
                        继续编辑
                      </Link>
                      <PrOrderActionBtn onClick={() => onDeleteDraft(draft.id)}>删除</PrOrderActionBtn>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        {(tab === 'drafts' ? filteredDrafts.length : filteredRows.length) > pageSize ? (
          <footer className="pr-orders-pagination">
            <span>共 {listCount} 条</span>
            <div className="pr-orders-pagination__controls">
              <button type="button" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = i + 1
                return (
                  <button
                    key={page}
                    type="button"
                    className={listPage === page ? 'is-on' : ''}
                    onClick={() => setListPage(page)}
                  >
                    {page}
                  </button>
                )
              })}
              <button
                type="button"
                disabled={listPage >= totalPages}
                onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
              <span className="pr-orders-pagination__size">{pageSize} 条/页</span>
              <label className="pr-orders-pagination__jump">
                跳至
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const n = Number(jumpPage)
                      if (n >= 1 && n <= totalPages) setListPage(n)
                    }
                  }}
                />
                页
              </label>
            </div>
          </footer>
        ) : null}
      </div>

      {shareSheet ? (
        <RecruitmentShareSheet
          text={shareSheet.text}
          title={shareSheet.title}
          order={shareSheet.order}
          onClose={() => setShareSheet(null)}
        />
      ) : null}
    </div>
  )
}
