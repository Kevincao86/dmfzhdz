import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import {
  buildChannelStats,
  filterProjectsByChannel,
  filterPromotionsByChannel,
} from '../../lib/localPromotionAnalytics'
import {
  xhsClueToLocal,
  xhsProjectToLocal,
  xhsPromotionToLocal,
  xhsSummaryToLocal,
} from '../../lib/advertisingRowAdapters'
import { isXhsCommercialBound, readXhsCommercialBinding } from '../../lib/xhsCommercialBinding'
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
import type { XhsClueRow, XhsPromotionRow, XhsReportSummary } from '../../lib/xhsCommercialTypes'
import {
  fetchXhsClues,
  fetchXhsProjects,
  fetchXhsPromotions,
  fetchXhsReportSummary,
  postXhsAdAiInsight,
  postXhsClueAiSuggest,
  postXhsClueCallback,
  updateXhsPromotionStatus,
} from '../../services/xhsCommercialApi'
import LocalPromotionAiOverviewPanel from './LocalPromotionAiOverviewPanel'
import LocalPromotionChannelPanel from './LocalPromotionChannelPanel'
import LocalPromotionLeadsAnalysisPanel from './LocalPromotionLeadsAnalysisPanel'

type LocalPane = LocalPromotionAiPane

const LOCAL_PANES: Array<{ id: LocalPane; label: string; hint: string }> = [
  { id: 'live', label: '直播间投流', hint: '直播推广计划' },
  { id: 'video', label: '短视频投流', hint: '笔记/短视频计划' },
  { id: 'leads', label: '线索分析', hint: '种小草线索归因' },
  { id: 'ai', label: 'AI 整体分析', hint: '聚光+线索' },
]

const AI_MODE_STORAGE_KEY = 'meoo_xhs_juguang_ai_mode'

function readStoredAiMode(): LocalPromotionAiMode {
  try {
    const v = localStorage.getItem(AI_MODE_STORAGE_KEY)
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

export default function XhsAdvertisingFourPanePanel() {
  const [pane, setPane] = useState<LocalPane>('live')
  const [promotions, setPromotions] = useState<LocalPromotionRow[]>([])
  const [projects, setProjects] = useState<LocalProjectRow[]>([])
  const [clues, setClues] = useState<LocalClueRow[]>([])
  const [summary, setSummary] = useState<LocalReportSummary | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiMode, setAiMode] = useState<LocalPromotionAiMode>(readStoredAiMode)
  const [paneAi, setPaneAi] = useState<Record<LocalPane, PaneAiState>>({
    live: emptyPaneAi(),
    video: emptyPaneAi(),
    leads: emptyPaneAi(),
    ai: emptyPaneAi(),
  })
  const [aiApplyingId, setAiApplyingId] = useState<string | null>(null)
  const [aiRunning, setAiRunning] = useState(false)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)

  const bind = readXhsCommercialBinding()
  const platformLabel = '小红书聚光'

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setApiError(null)
    try {
      const [pr, pj, rep, cr] = await Promise.all([
        fetchXhsPromotions(),
        fetchXhsProjects(),
        fetchXhsReportSummary(),
        fetchXhsClues(),
      ])
      const failures: string[] = []
      const apiErrors: string[] = []

      if (pr.ok) setPromotions(pr.list.map(xhsPromotionToLocal))
      else failures.push(pr.message)
      if (pr.ok && pr.apiError) apiErrors.push(pr.apiError)

      if (pj.ok) setProjects(pj.list.map(xhsProjectToLocal))
      else failures.push(pj.message)

      if (rep.ok) setSummary(xhsSummaryToLocal(rep.summary))
      else failures.push(rep.message)

      if (cr.ok) setClues(cr.list.map(xhsClueToLocal))
      else failures.push(cr.message)

      const hasCreds = Boolean(bind?.accessToken && bind.advertiserId)
      if (!hasCreds) {
        setPromotions([])
        setProjects([])
        setSummary(null)
        setClues([])
      }
      setApiError(apiErrors[0] ?? null)
      setError(failures[0] ?? null)
    } catch (e) {
      setError(toUserFacingError(e, '同步投流数据'))
    } finally {
      setLoading(false)
    }
  }, [bind?.accessToken, bind?.demoMode, bind?.advertiserId])

  useEffect(() => {
    void reload()
  }, [reload])

  const livePromotions = useMemo(
    () => filterPromotionsByChannel(promotions, 'live'),
    [promotions],
  )
  const videoPromotions = useMemo(
    () => filterPromotionsByChannel(promotions, 'video'),
    [promotions],
  )
  const liveProjects = useMemo(() => filterProjectsByChannel(projects, 'live'), [projects])
  const videoProjects = useMemo(() => filterProjectsByChannel(projects, 'video'), [projects])
  const channelStats = useMemo(
    () => buildChannelStats({ promotions, clues }),
    [promotions, clues],
  )

  const setAiModePersist = (mode: LocalPromotionAiMode) => {
    setAiMode(mode)
    try {
      localStorage.setItem(AI_MODE_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
    if (mode === 'manual' || mode === 'assisted') {
      setAiRunning(false)
    }
    if (mode === 'full_ai' || mode === 'auto_adjust') {
      setPaneAi((prev) => ({
        ...prev,
        [pane]: { ...prev[pane], insight: null, actions: [] },
      }))
    }
  }

  const runPaneAi = useCallback(
    async (targetPane: LocalPane = pane, modeOverride?: LocalPromotionAiMode) => {
      const effectiveMode = modeOverride ?? (targetPane === 'ai' ? 'assisted' : aiMode)
      if (effectiveMode === 'manual') return
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
              : promotions
        const r = await postXhsAdAiInsight({
          summary: summary as unknown as XhsReportSummary,
          promotions: promos.map((p: LocalPromotionRow) => ({ ...p })) as unknown as XhsPromotionRow[],
          clues: clues as unknown as XhsClueRow[],
          channelStats,
          pane: targetPane,
          mode: effectiveMode,
        })
        if (r.ok) {
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: {
              insight: r.insight,
              actions: (r.actions as LocalPromotionAiAction[] | undefined) ?? [],
              busy: false,
            },
          }))
        } else {
          setError(r.message)
          setPaneAi((prev) => ({
            ...prev,
            [targetPane]: { ...prev[targetPane], busy: false },
          }))
        }
      } catch (e) {
        setError(toUserFacingError(e, 'AI 投流分析'))
        setPaneAi((prev) => ({
          ...prev,
          [targetPane]: { ...prev[targetPane], busy: false },
        }))
      }
    },
    [aiMode, pane, livePromotions, videoPromotions, promotions, summary, clues, channelStats],
  )

  useEffect(() => {
    if (pane === 'ai') {
      const cur = paneAi.ai
      if (cur.busy || cur.insight || loading) return
      void runPaneAi('ai')
      return
    }
    if (aiMode !== 'full_ai' && aiMode !== 'auto_adjust') return
    if (!aiRunning) return
    const cur = paneAi[pane]
    if (cur.busy || cur.insight) return
    if (loading) return
    void runPaneAi(pane)
  }, [pane, aiMode, aiRunning, loading, paneAi, runPaneAi])

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
    setAiApplyingId(action.actionId)
    try {
      const r = await updateXhsPromotionStatus(
        [action.promotionId],
        action.actionType === 'enable' ? 'ENABLE' : 'DISABLE',
      )
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

  const togglePromotion = async (row: LocalPromotionRow, enable: boolean) => {
    setStatusBusy(row.promotionId)
    try {
      const r = await updateXhsPromotionStatus([row.promotionId], enable ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
    } finally {
      setStatusBusy(null)
    }
  }

  const bound = isXhsCommercialBound()
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
      <div className="mb-4 flex justify-end">
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

      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          尚未绑定{platformLabel}，绑定后可同步真实投流数据。
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            前往系统设置 · 商业化后台 · 小红书聚光
          </Link>
        </div>
      ) : apiError ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
          <p className="font-medium">已绑定但暂未拉到真实数据</p>
          <p className="mt-1 text-xs leading-relaxed">
            {apiError}。请确认：① 广告主 ID{' '}
            <code className="rounded bg-white/80 px-1">{bind?.advertiserId}</code>{' '}
            与{platformLabel}后台一致；② 应用已开通投放/报表/线索权限；③ Token 未过期。
          </p>
        </div>
      ) : null}

      {bound && bind ? (
        <p className="mb-4 text-xs text-slate-500">
          当前{platformLabel}账号：<strong>{bind.accountName}</strong>
          <span className="ml-2 tabular-nums">ID {bind?.advertiserId}</span>
          {loading ? (
            <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-slate-400" />
          ) : null}
        </p>
      ) : null}

      {error && !apiError ? <p className="mb-4 text-sm text-amber-700">{error}</p> : null}

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
              promotions={promotions}
              summary={summary}
              loading={loading}
              onReload={reload}
              clueApi={{
                suggest: async (input) => {
                  const r = await postXhsClueAiSuggest({
                    clueId: 'xhs',
                    name: input.name,
                    phone: input.phone,
                    promotionName: input.promotionName,
                    convertState: input.convertState ?? 'NEW',
                    convertStateLabel: input.convertStateLabel ?? '新线索',
                    createdAt: new Date().toISOString(),
                  })
                  if (!r.ok) return r
                  return { ok: true as const, suggestion: r.suggestion }
                },
                callback: async (input) => {
                  const r = await postXhsClueCallback({
                    clueId: input.clueId,
                    convertState: input.convertState,
                  })
                  return r
                },
              }}
              {...aiPanelProps}
            />
          ) : null}

      {pane === 'ai' ? (
        <LocalPromotionAiOverviewPanel
          summary={summary}
          promotions={promotions}
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
  )
}
