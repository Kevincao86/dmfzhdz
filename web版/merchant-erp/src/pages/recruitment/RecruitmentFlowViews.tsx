import {
  Calendar,
  Check,
  ChevronLeft,
  Flag,
  Loader2,
  RefreshCw,
  Trash2,
  Video,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  appendTalentInboxOnOps,
  fetchOpsRegistryForTenant,
  patchRecruitmentOrderOnOps,
  setRecruitmentScheduleRowsOnOps,
  setRecruitmentVideoSubmissionsOnOps,
  setTalentPoolCandidatesOnOps,
} from '../../lib/opsRegistryClient'
import type { RegistryScheduleRow, RegistryTalentPoolRow, RegistryVideoSubmission } from '../../lib/opsRegistryTypes'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import { tenantLocalKey } from '../../lib/tenantLocalState'
import { tenantScheduleRowId } from '../../lib/registryTenantIsolation'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { generateRecruitmentScheduleRowsAi } from '../../services/recruitmentScheduleAi'

async function loadTenantScopedRegistry() {
  const tenantId = supabaseConfigured && supabase ? await fetchPrimaryTenantId(supabase) : null
  return fetchOpsRegistryForTenant(tenantId)
}

function readLastSubmitMeta(): { table?: number; slots?: string[]; name?: string; stores?: { name: string }[] } {
  try {
    const raw = window.localStorage.getItem(tenantLocalKey('meoo_last_recruitment_submit'))
    if (!raw) return {}
    return JSON.parse(raw) as {
      tablePerMeal?: number
      visitSlots?: string[]
      name?: string
      stores?: { name: string }[]
    }
  } catch {
    return {}
  }
}

async function persistTalentPool(rows: RegistryTalentPoolRow[]) {
  await setTalentPoolCandidatesOnOps(rows)
}

export function RecruitmentTalentPoolView({ onBack }: { onBack: () => void }) {
  const [allRows, setAllRows] = useState<RegistryTalentPoolRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await loadTenantScopedRegistry()
      setAllRows(r.talentPoolCandidates ?? [])
    } catch {
      setAllRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 6000)
    return () => window.clearInterval(t)
  }, [load])

  const rows = useMemo(() => {
    let lastOrderId = ''
    try {
      lastOrderId = window.localStorage.getItem(tenantLocalKey('meoo_last_recruitment_order_id'))?.trim() ?? ''
    } catch {
      /* ignore */
    }
    if (!lastOrderId) return allRows
    return allRows.filter((row) => {
      const sid = row.sourceRecruitmentOrderId
      return !sid || sid === lastOrderId
    })
  }, [allRows])

  const stats = useMemo(() => {
    const matched = rows.length
    const pending = rows.filter((r) => r.status === 'pending_confirm').length
    const confirmed = rows.filter((r) => r.status === 'confirmed').length
    const rejected = rows.filter((r) => r.status === 'rejected').length
    return { matched, pending, confirmed, rejected }
  }, [rows])

  const patchRow = async (id: string, patch: Partial<RegistryTalentPoolRow>) => {
    const next = allRows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    setAllRows(next)
    try {
      await persistTalentPool(next)
    } catch {
      window.alert('保存失败：请稍后重试或联系管理员检查数据同步环境。')
      void load()
    }
  }

  const removeRow = async (id: string) => {
    const next = allRows.filter((r) => r.id !== id)
    setAllRows(next)
    try {
      await persistTalentPool(next)
    } catch {
      void load()
    }
  }

  const replaceRow = async (id: string) => {
    const nick = window.prompt('输入替换达人昵称或 ID', '')?.trim()
    if (!nick) return
    await patchRow(id, {
      name: nick,
      status: 'pending_confirm',
      schedulingConflict: false,
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">达人池确认</h1>
          <p className="mt-1 text-sm text-gray-500">
            数据来自 dev 注册表「达人候选」：由运营管控台回传解析或上游 API 写入；下方操作会回写注册表。若本机存在最近一次 ERP
            提交的招募订单号，则优先展示该单关联的达人（含未带单号的旧数据）。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '匹配达人', v: stats.matched },
          { label: '待确认', v: stats.pending },
          { label: '已确认', v: stats.confirmed },
          { label: '已拒绝', v: stats.rejected },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{x.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{x.v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        当前需求：达人招募 · {loading ? '同步注册表…' : rows.length ? `共 ${rows.length} 人` : '暂无候选，请在管控台回传或完成上游同步'}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-900">匹配达人列表</div>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">暂无数据</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-4 py-3',
                  r.schedulingConflict ? 'bg-red-50/60' : 'hover:bg-gray-50/80',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.contentFormat}</span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{r.platform}</span>
                    {r.schedulingConflict ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">排期冲突</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {r.followers.toLocaleString('zh-CN')} 粉丝 · {r.niche}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    基础 ¥{r.baseFee} · 绩效 ¥{r.bonus} · 合计 ¥{r.baseFee + r.bonus}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    r.status === 'confirmed' && 'bg-emerald-100 text-emerald-800',
                    r.status === 'pending_confirm' && 'bg-gray-100 text-gray-700',
                    r.status === 'communicating' && 'bg-amber-100 text-amber-800',
                    r.status === 'rejected' && 'bg-red-100 text-red-700',
                  )}
                >
                  {r.status === 'pending_confirm'
                    ? '待确认'
                    : r.status === 'confirmed'
                      ? '已确认'
                      : r.status === 'rejected'
                        ? '已拒绝'
                        : '沟通中'}
                </span>
                <div className="flex items-center gap-1 text-gray-400">
                  <button
                    type="button"
                    title="标记沟通中"
                    onClick={() => void patchRow(r.id, { status: 'communicating' })}
                    className="rounded p-1.5 hover:bg-gray-100"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="确认"
                    onClick={() => void patchRow(r.id, { status: 'confirmed', schedulingConflict: false })}
                    className="rounded p-1.5 hover:bg-gray-100"
                  >
                    <Check className="h-4 w-4 text-emerald-600" />
                  </button>
                  <button type="button" title="替换" onClick={() => void replaceRow(r.id)} className="rounded p-1.5 hover:bg-gray-100">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button type="button" title="删除" onClick={() => void removeRow(r.id)} className="rounded p-1.5 hover:bg-gray-100">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
                {r.schedulingConflict ? (
                  <button
                    type="button"
                    onClick={() => void replaceRow(r.id)}
                    className="w-full rounded-lg bg-orange-500 py-2 text-sm font-medium text-white sm:w-auto"
                  >
                    替换达人
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RecruitmentScheduleView({
  onBack,
  onEnterVideo,
}: {
  onBack: () => void
  onEnterVideo?: () => void
}) {
  const [rows, setRows] = useState<RegistryScheduleRow[]>([])
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [mealCount, setMealCount] = useState(1)
  const [tableSize, setTableSize] = useState(4)
  const [shareTable, setShareTable] = useState(true)
  const [visitSlots, setVisitSlots] = useState('09:00-12:00,14:00-17:00')
  const [orderId, setOrderId] = useState('')
  const [mpOrderId, setMpOrderId] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await loadTenantScopedRegistry()
      setRows(r.recruitmentScheduleRows ?? [])
      let lastId = ''
      try {
        lastId = window.localStorage.getItem(tenantLocalKey('meoo_last_recruitment_order_id'))?.trim() ?? ''
      } catch {
        /* ignore */
      }
      const order = (r.recruitmentOrders ?? []).find((o) => o.id === lastId)
      setOrderId(lastId)
      setMpOrderId(order?.linkedMpOrderId ?? '')
      const sm = order?.scheduleMeta
      if (sm?.mealCount) setMealCount(sm.mealCount)
      if (sm?.tableSize) setTableSize(sm.tableSize)
      if (typeof sm?.shareTable === 'boolean') setShareTable(sm.shareTable)
      if (sm?.visitSlots?.length) setVisitSlots(sm.visitSlots.join(','))
      setLoadErr(null)
    } catch {
      setLoadErr('无法读取注册表')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runAiSchedule = async () => {
    setBusy(true)
    try {
      const tenantId = supabaseConfigured && supabase ? await fetchPrimaryTenantId(supabase) : null
      const meta = readLastSubmitMeta()
      const reg = await loadTenantScopedRegistry()
      const order = (reg.recruitmentOrders ?? []).find((o) => o.id === orderId)
      const mp = order?.linkedMpOrderId
        ? (reg.mpRecruitmentOrders ?? []).find((m) => m.id === order.linkedMpOrderId)
        : null
      const selectedTalents =
        mp?.applicants?.filter((a) => a.merchantSelected || a.prSelected) ??
        reg.talentPoolCandidates?.filter((t) => t.status === 'confirmed') ??
        []
      const slots = visitSlots.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      const ctx = JSON.stringify(
        {
          recruitmentName: meta.name,
          visitSlots: slots.length ? slots : meta.slots,
          mealCount,
          tableSize,
          shareTable,
          tablePerMeal: tableSize,
          stores: meta.stores,
          selectedTalents: selectedTalents.map((t) => ('name' in t ? t.name : (t as { platformNickname?: string }).platformNickname)),
          note: '按已反选达人名单生成探店排期，含餐食与拼桌信息',
        },
        null,
        2,
      )
      let next = await generateRecruitmentScheduleRowsAi(ctx)
      if (next.length === 0) {
        const slots = meta.slots?.length ? meta.slots : ['09:00-12:00', '14:00-17:00']
        const pool =
          selectedTalents.length > 0
            ? selectedTalents.map((t, i) => ({
                name: 'name' in t ? String(t.name) : String((t as { platformNickname?: string }).platformNickname || `达人${i + 1}`),
              }))
            : (await loadTenantScopedRegistry()).talentPoolCandidates?.filter((t) => t.status === 'confirmed') ?? []
        if (pool.length === 0) {
          window.alert('AI 未返回排期，且无已反选达人。请先在「达人反选」确认名单或检查 AI 配置。')
          await load()
          return
        }
        const base = new Date()
        base.setDate(base.getDate() + 1)
        next = pool.map((row, i) => {
          const d = new Date(base)
          d.setDate(d.getDate() + i)
          const slot = slots[i % slots.length]!
          const localId = `sch-${Date.now()}-${i}`
          return {
            id: tenantId ? tenantScheduleRowId(tenantId, localId) : localId,
            time: `${d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${slot}`,
            talentName: row.name,
            storeName: meta.stores?.[0]?.name?.trim() || '待补充门店',
            tableNote: shareTable
              ? `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份（规则回退）`
              : `单独探店 · 餐食 ${mealCount} 份（规则回退）`,
          }
        })
      }
      if (tenantId) {
        next = next.map((r) => ({
          ...r,
          id: tenantScheduleRowId(tenantId, r.id),
        }))
      }
      setRows(next)
      await setRecruitmentScheduleRowsOnOps(next)
    } catch {
      window.alert('排期写入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">探店参数</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            餐食份数
            <input type="number" min={1} value={mealCount} onChange={(e) => setMealCount(Number(e.target.value) || 1)} className="mt-1 w-full rounded-lg border px-2 py-1.5" />
          </label>
          <label className="text-sm">
            每桌人数
            <input type="number" min={1} value={tableSize} onChange={(e) => setTableSize(Number(e.target.value) || 4)} className="mt-1 w-full rounded-lg border px-2 py-1.5" />
          </label>
          <label className="text-sm sm:col-span-2">
            探店时段（逗号分隔）
            <input value={visitSlots} onChange={(e) => setVisitSlots(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5" />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={shareTable} onChange={(e) => setShareTable(e.target.checked)} />
          需要拼桌（多人一桌）
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="erp-page-title">AI 自动排期</h1>
          <p className="mt-1 text-sm text-gray-500">基于已反选达人生成排期；确认后将通过星选站内信下发各达人探店时间。</p>
          {loadErr ? <p className="mt-1 text-xs text-red-600">{loadErr}</p> : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAiSchedule()}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          重新排期
        </button>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">✓ 达人池确认</span>
        <span className="rounded-full bg-blue-600 px-3 py-1 text-white">2 AI 自动排期</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">3 执行探店</span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
            <Calendar className="mb-3 h-12 w-12 text-gray-300" />
            <p>暂无排期，请点击「重新排期」生成并写入注册表</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                <span className="font-medium text-gray-900">{r.time}</span>
                <span className="text-gray-700">{r.talentName}</span>
                <span className="text-gray-500">{r.storeName}</span>
                <span className="text-xs text-blue-700">{r.tableNote}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
        <span>排期已生成。确认后将通知星选达人具体探店时间。</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !rows.length || !orderId}
            onClick={() => {
              const csv = ['时间,达人,门店,备注', ...rows.map((r) => `${r.time},${r.talentName},${r.storeName},${r.tableNote}`)].join('\n')
              const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `探店排期-${orderId || 'export'}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm"
          >
            下载 Excel(CSV)
          </button>
          <button
            type="button"
            disabled={busy || !rows.length || !orderId || !mpOrderId}
            onClick={async () => {
              setBusy(true)
              try {
                const reg = await loadTenantScopedRegistry()
                const mp = (reg.mpRecruitmentOrders ?? []).find((m) => m.id === mpOrderId)
                const selected = mp?.applicants?.filter((a) => a.merchantSelected || a.prSelected) ?? []
                const lines = rows.map((r) => `${r.talentName}：${r.time} @ ${r.storeName}（${r.tableNote}）`).join('\n')
                await patchRecruitmentOrderOnOps({
                  id: orderId,
                  scheduleMeta: {
                    mealCount,
                    tableSize,
                    shareTable,
                    visitSlots: visitSlots.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
                    scheduleConfirmedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
                    scheduleSentAt: new Date().toLocaleString('zh-CN', { hour12: false }),
                  },
                  workflowStage: 'video_review',
                })
                const { resolveTalentMemberIdForApplicant } = await import('../../lib/merchantRecruitmentInbox')
                const entries = selected.map((a) => {
                  const row = rows.find((r) => r.talentName === (a.platformNickname || a.name))
                  return {
                    talentMemberId: resolveTalentMemberIdForApplicant(a, reg),
                    title: '探店排期已确认',
                    body: row ? `${row.time} · ${row.storeName}\n${row.tableNote}` : lines.slice(0, 400),
                    category: 'order' as const,
                    mpOrderId: mpOrderId,
                    applicantId: a.id,
                    noticeType: 'general' as const,
                  }
                })
                if (entries.length) await appendTalentInboxOnOps(entries)
                window.alert('排期已确认并下发至星选达人。')
              } catch {
                window.alert('下发失败，请重试')
              } finally {
                setBusy(false)
              }
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            确认排期并通知达人
          </button>
          <button
            type="button"
            onClick={() => onEnterVideo?.()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            进入视频审核 →
          </button>
        </div>
      </div>
    </div>
  )
}

export function RecruitmentVideoReviewView({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState<RegistryVideoSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [mpOrderId, setMpOrderId] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await loadTenantScopedRegistry()
      let lastId = ''
      try {
        lastId = window.localStorage.getItem(tenantLocalKey('meoo_last_recruitment_order_id'))?.trim() ?? ''
      } catch {
        /* ignore */
      }
      const order = (r.recruitmentOrders ?? []).find((o) => o.id === lastId)
      const mp = order?.linkedMpOrderId
        ? (r.mpRecruitmentOrders ?? []).find((m) => m.id === order.linkedMpOrderId)
        : null
      setMpOrderId(mp?.id ?? '')
      const fromMp: RegistryVideoSubmission[] = (mp?.applicants ?? [])
        .filter((a) => (a.merchantSelected || a.prSelected) && a.videoUrl)
        .map((a) => ({
          id: `vid-${a.id}`,
          author: a.platformNickname || a.name,
          title: '探店审核视频',
          status:
            a.videoStatus === 'passed' || a.aiVerifyStatus === 'passed'
              ? 'passed'
              : a.videoStatus === 'rejected'
                ? 'rejected'
                : 'pending',
          submittedAt: a.videoSubmittedAt || a.appliedAt,
          aiNote: a.videoRejectReason || a.aiVerifyNote || '待商家审核',
          videoUrl: a.videoUrl,
          applicantId: a.id,
          mpOrderId: mp?.id,
          recruitmentOrderId: lastId,
          rejectReason: a.videoRejectReason,
        }))
      const legacy = r.recruitmentVideoSubmissions ?? []
      const merged = [...fromMp, ...legacy.filter((l) => !fromMp.some((f) => f.id === l.id))]
      setCards(merged)
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const stats = useMemo(() => {
    return {
      pending: cards.filter((c) => c.status === 'pending').length,
      passed: cards.filter((c) => c.status === 'passed').length,
      rejected: cards.filter((c) => c.status === 'rejected').length,
      total: cards.length,
    }
  }, [cards])

  const setStatus = async (id: string, status: RegistryVideoSubmission['status'], rejectReason?: string) => {
    const card = cards.find((c) => c.id === id)
    const next = cards.map((c) =>
      c.id === id ? { ...c, status, rejectReason: rejectReason ?? c.rejectReason, aiNote: rejectReason || c.aiNote } : c,
    )
    setCards(next)
    try {
      if (card?.applicantId && mpOrderId) {
        const r = await loadTenantScopedRegistry()
        const mp = (r.mpRecruitmentOrders ?? []).find((m) => m.id === mpOrderId)
        if (mp?.applicants) {
          const applicants = mp.applicants.map((a) =>
            a.id === card.applicantId
              ? {
                  ...a,
                  videoStatus: status === 'passed' ? ('passed' as const) : status === 'rejected' ? ('rejected' as const) : ('pending' as const),
                  videoRejectReason: status === 'rejected' ? rejectReason || '请修改后重新上传' : undefined,
                  aiVerifyStatus: status === 'passed' ? ('passed' as const) : status === 'rejected' ? ('failed' as const) : a.aiVerifyStatus,
                }
              : a,
          )
          const { patchMpRecruitmentOrderOnOps } = await import('../../lib/opsRegistryClient')
          await patchMpRecruitmentOrderOnOps({ id: mpOrderId, applicants })
        }
      }
      await setRecruitmentVideoSubmissionsOnOps(next.filter((c) => !c.applicantId))
    } catch {
      window.alert('保存失败')
      void load()
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div>
        <h1 className="erp-page-title">视频审核管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          列表数据来自注册表 `recruitmentVideoSubmissions`（由上传服务或 API 写入）；{loading ? '加载中…' : '通过/驳回会回写注册表。'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '待审核', v: stats.pending },
          { label: '已通过', v: stats.passed },
          { label: '已驳回', v: stats.rejected },
          { label: '总视频数', v: stats.total },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{x.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{x.v}</div>
          </div>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-16 text-center text-sm text-gray-500">
          暂无待审视频。生产环境由达人上传回调写入注册表后在此展示。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="relative aspect-video bg-gray-100">
                {c.thumbUrl ? (
                  <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">无封面</div>
                )}
                {c.duration ? (
                  <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{c.duration}</span>
                ) : null}
                <span
                  className={cn(
                    'absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-medium',
                    c.status === 'pending' && 'bg-amber-500 text-white',
                    c.status === 'passed' && 'bg-emerald-600 text-white',
                    c.status === 'rejected' && 'bg-red-600 text-white',
                  )}
                >
                  {c.status === 'pending' ? '待审核' : c.status === 'passed' ? '已通过' : '已驳回'}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <div className="text-xs text-gray-500">{c.author}</div>
                <div className="font-medium text-gray-900">{c.title}</div>
                <div className="rounded-lg bg-indigo-50/80 p-2 text-xs text-indigo-900">
                  <span className="font-semibold">说明：</span>
                  {c.rejectReason || c.aiNote || '—'}
                </div>
                {c.videoUrl ? (
                  <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                    打开视频（OSS）
                  </a>
                ) : null}
                <div className="text-xs text-gray-400">提交 {c.submittedAt}</div>
                <div className="flex flex-wrap gap-2">
                  {c.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void setStatus(c.id, 'passed')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('请输入驳回原因（达人将看到并可在星选重新上传）', '')?.trim()
                          if (!reason) return
                          void setStatus(c.id, 'rejected', reason)
                        }}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                      >
                        驳回
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700">
                    <Video className="mr-1 h-3 w-3" />
                    查看
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RecruitmentPaymentView({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">结款账单</h1>
        <p className="mt-2 text-sm text-gray-600">
          金额以财务与订单结算为准；确认后将生成打款单，便于后续对账与打款流程。
        </p>
        <ul className="mt-6 space-y-2 text-sm text-gray-700">
          <li className="flex justify-between border-b border-gray-100 py-2">
            <span>应付（待订单服务汇总）</span>
            <span className="font-medium">¥ —</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={() => window.alert('已记录打款确认意向；生产环境对接财务工单。')}
          className="mt-8 w-full rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
          确认打款
        </button>
      </div>
    </div>
  )
}
