import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import {
  buildChannelStats,
  filterProjectsByChannel,
  filterPromotionsByChannel,
} from '../../lib/localPromotionAnalytics'
import { readLocalPromotionBinding } from '../../lib/localPromotionBinding'
import { readQianchuanBinding } from '../../lib/qianchuanBinding'
import { toUserFacingError } from '../../lib/userFacingError'
import type {
  LocalClueRow,
  LocalProjectRow,
  LocalPromotionAiAction,
  LocalPromotionAiMode,
  LocalPromotionAiPane,
  LocalPromotionRow,
  LocalReportSummary,
} from '../../lib/localPromotionTypes'
import {
  createLocalPromotion,
  fetchLocalClues,
  fetchLocalProjects,
  fetchLocalPromotions,
  fetchLocalReportSummary,
  postAdAiInsight,
  updatePromotionStatus,
  updateProjectStatus,
} from '../../services/localPromotionApi'
import {
  createQianchuanPromotion,
  fetchLocalClues as fetchQianchuanClues,
  fetchLocalProjects as fetchQianchuanProjects,
  fetchQianchuanPromotions,
  fetchLocalReportSummary as fetchQianchuanReportSummary,
  postAdAiInsight as postQianchuanAdAiInsight,
  updatePromotionStatus as updateQianchuanPromotionStatus,
} from '../../services/qianchuanApi'
import LocalPromotionAiOverviewPanel from './LocalPromotionAiOverviewPanel'
import LocalPromotionChannelPanel from './LocalPromotionChannelPanel'
import LocalPromotionLeadsAnalysisPanel from './LocalPromotionLeadsAnalysisPanel'

type OceanPlatform = 'local_promotion' | 'qianchuan'
type LocalPane = LocalPromotionAiPane

const LOCAL_PANES: Array<{ id: LocalPane; label: string; hint: string }> = [
  { id: 'live', label: '直播间投流', hint: 'LIVE 类营销目标' },
  { id: 'video', label: '短视频投流', hint: '短视频/图文类计划' },
  { id: 'leads', label: '线索分析', hint: '表单/私信线索归因' },
  { id: 'ai', label: 'AI 整体分析', hint: '直播+短视频+线索' },
]

const AI_MODE_STORAGE_KEYS: Record<OceanPlatform, string> = {
  local_promotion: 'meoo_local_promotion_ai_mode',
  qianchuan: 'meoo_qianchuan_ai_mode',
}

function readStoredAiMode(platform: OceanPlatform): LocalPromotionAiMode {
  try {
    const v = localStorage.getItem(AI_MODE_STORAGE_KEYS[platform])
    if (v === 'manual' || v === 'assisted' || v === 'full_ai' || v === 'auto_adjust') return v
  } catch {
    /* ignore */
  }
  return 'assisted'
}

type PaneAiState = {
  insight: string | null
  actions: LocalPromotionAiAction[]
  busy: boolean
}

const emptyPaneAi = (): PaneAiState => ({ insight: null, actions: [], busy: false })

function inferLocalMarketingGoal(
  row: { marketingGoal?: string; promotionName?: string; projectName?: string; projectId?: string },
  projects: LocalProjectRow[],
): string {
  const raw = String(row.marketingGoal ?? '').trim()
  if (raw) return raw
  const proj = row.projectId ? projects.find((p) => p.projectId === row.projectId) : undefined
  if (proj?.marketingGoal?.trim()) return proj.marketingGoal.trim()
  const blob = `${row.promotionName ?? ''} ${row.projectName ?? ''} ${proj?.projectName ?? ''}`
  if (/短视频|图文/.test(blob)) return 'VIDEO_IMAGE'
  if (/直播/.test(blob)) return 'LIVE'
  return raw
}

export default function OceanEngineAdvertisingInner({ platform }: { platform: OceanPlatform }) {
  const [pane, setPane] = useState<LocalPane>('live')
  const [promotions, setPromotions] = useState<LocalPromotionRow[]>([])
  const [projects, setProjects] = useState<LocalProjectRow[]>([])
  const [clues, setClues] = useState<LocalClueRow[]>([])
  const [summary, setSummary] = useState<LocalReportSummary | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiMode, setAiMode] = useState<LocalPromotionAiMode>(() => readStoredAiMode(platform))
  const [paneAi, setPaneAi] = useState<Record<LocalPane, PaneAiState>>({
    live: emptyPaneAi(),
    video: emptyPaneAi(),
    leads: emptyPaneAi(),
    ai: emptyPaneAi(),
  })
  const [aiApplyingId, setAiApplyingId] = useState<string | null>(null)
  const [aiRunning, setAiRunning] = useState(false)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBudget, setCreateBudget] = useState('300')
  const [createBusy, setCreateBusy] = useState(false)
  const [createMsg, setCreateMsg] = useState<string | null>(null)
  const reloadGen = useRef(0)

  const bind =
    platform === 'qianchuan' ? readQianchuanBinding() : readLocalPromotionBinding()
  const bound = Boolean(bind?.accessToken && bind.localAccountId)
  const platformLabel = platform === 'qianchuan' ? '巨量千川' : '本地推'

  const clearAdsState = useCallback(() => {
    setPromotions([])
    setProjects([])
    setSummary(null)
    setClues([])
    setApiError(null)
    setError(null)
  }, [])

  const reload = useCallback(async () => {
    const gen = ++reloadGen.current
    setLoading(true)
    setError(null)
    setApiError(null)
    if (!bound) {
      clearAdsState()
      if (platform === 'qianchuan') {
        setApiError(
          '当前账号尚未绑定巨量千川。千川是电商/直播带货投放账户，与本地推（到店）相互独立，不能共用数据。',
        )
      }
      setLoading(false)
      return
    }
    try {
      const fetchPromotions =
        platform === 'qianchuan' ? fetchQianchuanPromotions : fetchLocalPromotions
      const fetchProjects = platform === 'qianchuan' ? fetchQianchuanProjects : fetchLocalProjects
      const fetchSummary =
        platform === 'qianchuan' ? fetchQianchuanReportSummary : fetchLocalReportSummary
      const fetchClues = platform === 'qianchuan' ? fetchQianchuanClues : fetchLocalClues

      const [pr, pj, rep, cr] = await Promise.all([
        fetchPromotions(),
        fetchProjects(),
        fetchSummary(),
        fetchClues(),
      ])
      if (gen !== reloadGen.current) return
      const failures: string[] = []
      const apiErrors: string[] = []

      if (pr.ok) setPromotions(pr.list)
      else {
        setPromotions([])
        failures.push(pr.message)
      }
      if (pr.ok && pr.apiError) apiErrors.push(pr.apiError)

      if (pj.ok) setProjects(pj.list)
      else {
        setProjects([])
        failures.push(pj.message)
      }
      if (pj.ok && pj.apiError) apiErrors.push(pj.apiError)

      if (rep.ok) setSummary(rep.summary)
      else {
        setSummary(null)
        failures.push(rep.message)
      }
      if (rep.ok && 'apiError' in rep && rep.apiError) apiErrors.push(String(rep.apiError))

      if (cr.ok) setClues(cr.list)
      else {
        setClues([])
        failures.push(cr.message)
      }

      setApiError(apiErrors[0] ?? null)
      setError(failures[0] ?? null)
    } catch (e) {
      if (gen !== reloadGen.current) return
      clearAdsState()
      setError(toUserFacingError(e, '同步投流数据'))
    } finally {
      if (gen === reloadGen.current) setLoading(false)
    }
  }, [bound, clearAdsState, platform])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    clearAdsState()
    setAiMode(readStoredAiMode(platform))
    setAiRunning(false)
    setPaneAi({
      live: emptyPaneAi(),
      video: emptyPaneAi(),
      leads: emptyPaneAi(),
      ai: emptyPaneAi(),
    })
  }, [platform, clearAdsState])

  const classifiedPromotions = useMemo(
    () =>
      promotions.map((p) => ({
        ...p,
        marketingGoal: inferLocalMarketingGoal(p, projects),
      })),
    [promotions, projects],
  )
  const classifiedProjects = useMemo(
    () =>
      projects.map((p) => ({
        ...p,
        marketingGoal: inferLocalMarketingGoal(
          { marketingGoal: p.marketingGoal, projectName: p.projectName },
          [],
        ),
      })),
    [projects],
  )
  const livePromotions = useMemo(
    () => filterPromotionsByChannel(classifiedPromotions, 'live'),
    [classifiedPromotions],
  )
  const videoPromotions = useMemo(
    () => filterPromotionsByChannel(classifiedPromotions, 'video'),
    [classifiedPromotions],
  )
  const liveProjects = useMemo(
    () => filterProjectsByChannel(classifiedProjects, 'live'),
    [classifiedProjects],
  )
  const videoProjects = useMemo(
    () => filterProjectsByChannel(classifiedProjects, 'video'),
    [classifiedProjects],
  )
  const channelStats = useMemo(
    () => buildChannelStats({ promotions: classifiedPromotions, clues }),
    [classifiedPromotions, clues],
  )

  const setAiModePersist = (mode: LocalPromotionAiMode) => {
    setAiMode(mode)
    try {
      localStorage.setItem(AI_MODE_STORAGE_KEYS[platform], mode)
    } catch {
      /* ignore */
    }
    if (mode === 'manual' || mode === 'assisted') {
      setAiRunning(false)
    }
    if (mode === 'full_ai' || mode === 'auto_adjust') {
      setAiRunning(true)
      setPaneAi((prev) => ({
        ...prev,
        [pane]: { ...prev[pane], insight: null, actions: [] },
      }))
    }
  }

  const runPaneAi = useCallback(
    async (targetPane: LocalPane = pane, modeOverride?: LocalPromotionAiMode) => {
      const effectiveMode = modeOverride ?? (targetPane === 'ai' ? 'assisted' : aiMode)
      if (!bound || effectiveMode === 'manual') return
      setPaneAi((prev) => ({
        ...prev,
        [targetPane]: { ...prev[targetPane], busy: true },
      }))
      try {
        const promos =
          targetPane === 'live'
            ? livePromotions
            : targetPane === 'video'
              ? videoPromotions
              : classifiedPromotions
        const paneChannelStats =
          targetPane === 'live'
            ? channelStats.filter((s) => s.channel === 'live')
            : targetPane === 'video'
              ? channelStats.filter((s) => s.channel === 'video')
              : channelStats
        const promoNames = new Set(promos.map((p) => p.promotionName).filter(Boolean))
        const paneClues =
          targetPane === 'live' || targetPane === 'video'
            ? clues.filter((c) => !c.promotionName || promoNames.has(c.promotionName ?? ''))
            : clues
        const paneSummary = {
          ...(summary ?? {
            statCost: 0,
            showCnt: 0,
            clickCnt: 0,
            convertCnt: 0,
            ctr: 0,
            dateRange: { start: '', end: '' },
          }),
          statCost: promos.reduce((s, p) => s + (p.statCost ?? 0), 0),
          showCnt: promos.reduce((s, p) => s + (p.showCnt ?? 0), 0),
          clickCnt: promos.reduce((s, p) => s + (p.clickCnt ?? 0), 0),
          convertCnt: promos.reduce((s, p) => s + (p.convertCnt ?? 0), 0),
          ctr: 0,
        }
        const showCnt = paneSummary.showCnt
        paneSummary.ctr = showCnt > 0 ? Math.round((paneSummary.clickCnt / showCnt) * 10000) / 100 : 0
        const r = await (platform === 'qianchuan' ? postQianchuanAdAiInsight : postAdAiInsight)({
          summary: paneSummary,
          promotions: promos,
          clues: paneClues,
          channelStats: paneChannelStats,
          pane: targetPane,
          mode: effectiveMode,
        })
        if (r.ok) {
          const rawActions = r.actions ?? []
          const actions = rawActions.filter((a) => {
            const row = classifiedPromotions.find((p) => p.promotionId === a.promotionId)
            return !(row && row.projectId && row.promotionId === row.projectId)
          })
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: { insight: r.insight, actions, busy: false },
          }))
        } else {
          const aiMsg = /请先登录/.test(r.message)
            ? 'AI 分析需要当前商家登录态，请刷新页面后重试。'
            : r.message
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: { insight: aiMsg, actions: [], busy: false },
          }))
        }
      } catch (e) {
        const msg = toUserFacingError(e, 'AI 投流分析')
        setPaneAi((prev) => ({
          ...prev,
          [targetPane]: {
            insight: /请先登录/.test(msg) ? 'AI 分析需要当前商家登录态，请刷新页面后重试。' : msg,
            actions: [],
            busy: false,
          },
        }))
      }
    },
    [aiMode, bound, pane, livePromotions, videoPromotions, classifiedPromotions, summary, clues, channelStats, platform],
  )

  useEffect(() => {
    if (!bound) return
    if (pane === 'ai') {
      const cur = paneAi.ai
      if (cur.busy || cur.insight || loading) return
      void runPaneAi('ai')
      return
    }
    if (aiMode !== 'full_ai' && aiMode !== 'auto_adjust') return
    const cur = paneAi[pane]
    if (cur.busy || cur.insight) return
    if (loading) return
    const paneCount = pane === 'live' ? livePromotions.length : pane === 'video' ? videoPromotions.length : classifiedPromotions.length
    if (pane !== 'leads' && paneCount === 0) return
    void runPaneAi(pane)
  }, [pane, aiMode, loading, paneAi, runPaneAi, classifiedPromotions.length, livePromotions.length, videoPromotions.length])

  const handlePaneChange = (next: LocalPane) => {
    setPane(next)
    if (next === 'ai') return
    if (aiMode === 'full_ai' || aiMode === 'auto_adjust') {
      setPaneAi((prev) => ({
        ...prev,
        [next]: { ...prev[next], insight: null, actions: [] },
      }))
    }
  }

  const startAiAutomation = () => {
    setAiRunning(true)
    setPaneAi((prev) => ({
      ...prev,
      [pane]: { ...prev[pane], insight: null, actions: [] },
    }))
    void runPaneAi(pane)
  }

  const stopAiAutomation = () => {
    setAiRunning(false)
    setPaneAi((prev) => ({
      ...prev,
      [pane]: { ...prev[pane], busy: false },
    }))
  }

  const applyAiAction = async (action: LocalPromotionAiAction) => {
    if (!action.promotionId || (action.actionType !== 'enable' && action.actionType !== 'disable')) {
      return
    }
    const synthetic = classifiedPromotions.find(
      (p) => p.promotionId === action.promotionId && p.projectId && p.promotionId === p.projectId,
    )
    if (synthetic) {
      window.alert('该条来自自动投放项目，请在巨量本地推后台调整预算与素材，不要对项目 ID 做广告启停。')
      return
    }
    setAiApplyingId(action.actionId)
    try {
      const r = await (platform === 'qianchuan'
        ? updateQianchuanPromotionStatus
        : updatePromotionStatus)([action.promotionId], action.actionType === 'enable' ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
      setPaneAi((prev) => ({
        ...prev,
        [pane]: {
          ...prev[pane],
          actions: prev[pane].actions.filter((a) => a.actionId !== action.actionId),
        },
      }))
    } finally {
      setAiApplyingId(null)
    }
  }

  const submitCreate = async () => {
    const name = createName.trim()
    const budgetYuan = Number(createBudget)
    if (!name) {
      setCreateMsg('请填写计划名称')
      return
    }
    if (!Number.isFinite(budgetYuan) || budgetYuan < 100) {
      setCreateMsg('日预算至少 100 元')
      return
    }
    setCreateBusy(true)
    setCreateMsg(null)
    try {
      const goal = pane === 'live' ? 'LIVE' : 'VIDEO_IMAGE'
      const r = await (platform === 'qianchuan' ? createQianchuanPromotion : createLocalPromotion)({
        name,
        budgetYuan,
        marketingGoal: goal,
      })
      if (!r.ok) {
        setCreateMsg(r.message)
        return
      }
      setCreateMsg(r.message || '已创建。创意素材可随后在广告后台补齐。')
      setCreateName('')
      await reload()
    } finally {
      setCreateBusy(false)
    }
  }

  const togglePromotion = async (row: LocalPromotionRow, enable: boolean) => {
    if (row.promotionId && row.projectId && row.promotionId === row.projectId) {
      if (platform !== 'local_promotion') {
        window.alert('该条来自自动投放项目，请在巨量本地推后台管理广告计划。')
        return
      }
      setStatusBusy(row.promotionId)
      try {
        const r = await updateProjectStatus([row.projectId], enable ? 'ENABLE' : 'PAUSED')
        if (!r.ok) {
          window.alert(r.message)
          return
        }
        await reload()
      } finally {
        setStatusBusy(null)
      }
      return
    }
    setStatusBusy(row.promotionId)
    try {
      const r = await (platform === 'qianchuan'
        ? updateQianchuanPromotionStatus
        : updatePromotionStatus)([row.promotionId], enable ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
    } finally {
      setStatusBusy(null)
    }
  }

  const currentAi = paneAi[pane]

  const aiPanelProps = {
    aiMode,
    onAiModeChange: setAiModePersist,
    aiInsight: currentAi.insight,
    aiActions: currentAi.actions,
    aiBusy: currentAi.busy,
    aiApplyingId,
    onRunAi: () => void runPaneAi(pane),
    onApplyAiAction: (a: LocalPromotionAiAction) => void applyAiAction(a),
    aiRunning,
    onAiStart: startAiAutomation,
    onAiStop: stopAiAutomation,
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {bound ? (
          <button
            type="button"
            onClick={() => {
              setCreateOpen((v) => !v)
              setCreateMsg(null)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700"
          >
            <Plus className="h-4 w-4" />
            新建计划
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          同步
        </button>
      </div>

      {bound && createOpen ? (
        <div className="erp-panel mb-4 p-4">
          <p className="text-sm font-medium text-slate-800">新建{platformLabel}计划</p>
          <p className="mt-1 text-xs text-slate-500">
            将按当前页签创建（{pane === 'live' ? '直播' : '短视频'}）。日预算至少 100 元；视频/创意素材仍需在广告后台补齐。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              计划名称
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 block w-56 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="例如：周末到店短视频"
              />
            </label>
            <label className="text-xs text-slate-600">
              日预算（元）
              <input
                value={createBudget}
                onChange={(e) => setCreateBudget(e.target.value)}
                className="mt-1 block w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                inputMode="numeric"
              />
            </label>
            <button
              type="button"
              disabled={createBusy}
              onClick={() => void submitCreate()}
              className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {createBusy ? '创建中…' : '创建'}
            </button>
          </div>
          {createMsg ? <p className="mt-2 text-xs text-amber-800">{createMsg}</p> : null}
        </div>
      ) : null}

      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          {platform === 'qianchuan' ? (
            <>
              当前账号尚未绑定<strong>巨量千川</strong>（电商/直播带货）。它与「本地推」是两套广告主，不会显示本地推的计划和消耗。
            </>
          ) : (
            <>尚未绑定本地推，绑定后可同步到店投流数据。</>
          )}
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            前往系统设置 · 商业化后台 · 巨量工作台
          </Link>
        </div>
      ) : apiError ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
          <p className="font-medium">已绑定但暂未拉到真实数据</p>
          <p className="mt-1 text-xs leading-relaxed">
            {apiError}
            {platform === 'local_promotion' ? (
              <>
                。若当前 ID <code className="rounded bg-white/80 px-1">{bind?.localAccountId}</code>{' '}
                是升级版/旧版工作台，请到
                <Link to="/settings?tab=commercial" className="mx-1 font-medium text-cyan-700 underline">
                  系统设置重新校验
                </Link>
                ，选其下的「本地推投放账户」；并确认开放平台已开通「工作台账户管理」。
              </>
            ) : (
              <>
                。请确认：① 广告主 ID{' '}
                <code className="rounded bg-white/80 px-1">{bind?.localAccountId}</code>{' '}
                与{platformLabel}后台一致；② 应用已开通投放/报表权限；③ Token 未过期。
              </>
            )}
          </p>
        </div>
      ) : null}

      {bound && bind ? (
        <p className="mb-4 text-xs text-slate-500">
          当前{platformLabel}账号：<strong>{bind.accountName}</strong>
          <span className="ml-2 tabular-nums">ID {bind.localAccountId}</span>
          {loading ? (
            <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-slate-400" />
          ) : null}
        </p>
      ) : null}

      {error && !apiError ? <p className="mb-4 text-sm text-amber-700">{error}</p> : null}

      {bound ? (
        <>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {LOCAL_PANES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePaneChange(t.id)}
            className={cn(
              'rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              pane === t.id
                ? 'border-orange-600 text-orange-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] font-normal opacity-70">{t.hint}</span>
          </button>
        ))}
      </div>

      {pane === 'live' ? (
            <LocalPromotionChannelPanel
              title="直播间投流监测"
              description="筛选营销目标为 LIVE 的广告计划与项目，监测消耗、转化与在投状态。"
              pane="live"
              promotions={livePromotions}
              projects={liveProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
              {...aiPanelProps}
            />
          ) : null}

          {pane === 'video' ? (
            <LocalPromotionChannelPanel
              title="短视频投流监测"
              description="筛选短视频/图文类广告计划，查看展示、点击、转化与出价表现。"
              pane="video"
              promotions={videoPromotions}
              projects={videoProjects}
              loading={loading}
              statusBusy={statusBusy}
              onToggle={(row, enable) => void togglePromotion(row, enable)}
              {...aiPanelProps}
            />
          ) : null}

          {pane === 'leads' ? (
            <LocalPromotionLeadsAnalysisPanel
              clues={clues}
              promotions={classifiedPromotions}
              summary={summary}
              loading={loading}
              onReload={reload}
              {...aiPanelProps}
            />
          ) : null}

      {pane === 'ai' ? (
        <LocalPromotionAiOverviewPanel
          summary={summary}
          promotions={classifiedPromotions}
          clues={clues}
          loading={loading}
          aiInsight={paneAi.ai.insight}
          aiBusy={paneAi.ai.busy}
          onRunAi={() => {
            setPaneAi((prev) => ({
              ...prev,
              ai: { ...prev.ai, insight: null, actions: [] },
            }))
            void runPaneAi('ai')
          }}
        />
      ) : null}
        </>
      ) : null}
    </>
  )
}
