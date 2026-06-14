import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearMpRegistryCache, fetchMpRegistry, updateMpRecruitmentOrder } from '../../lib/mpApi'
import { getActiveRole } from '../../lib/mpSession'
import {
  buildScheduleCompletedPatch,
  buildPrWorkflowOrderPatch,
  resolvePrWorkflowStage,
} from '../../lib/mpRecruitment/prOrderWorkflowStage'
import {
  generateAiVisitSchedule,
  setVisitSchedule,
  type VisitScheduleRow,
} from '../../lib/mpSync/visitScheduleRuntime'
import { downloadVisitScheduleCsv } from '../../lib/mpSync/mpApplicantsExport'
import {
  canChat,
  ensureSessionWithTalent,
  formatChatError,
  syncProfile,
} from '../../lib/mpSync/talentChat'
import VisitScheduleDragBoard, {
  boardToScheduleRows,
  enrichApplicantPreference,
  initColumns,
  initVisitDates,
  slotStringsFromVisitDates,
  trimTablesToGlobalMax,
  type ApplicantLite,
  type ScheduleColumn,
  type VisitDateDef,
} from './VisitScheduleDragBoard'

type Props = {
  mpOrderId: string
  storeName: string
  category: string
  orderTitle?: string
  selectedApplicants: Record<string, unknown>[]
  onSaved: () => void
  onEffectiveSaved?: () => void
}

function applicantName(a: Record<string, unknown>): string {
  return String(a.platformNickname || a.name || a.platformAccount || a.id || '').trim()
}

function preferredTime(a: Record<string, unknown>): string {
  return String(a.talentPreferredVisitAt || a.visitTimeSlot || '').trim()
}

function initBoardState() {
  const visitDates = initVisitDates()
  return {
    visitDates,
    columns: initColumns(visitDates),
  }
}

export default function VisitSchedulePrPanel({
  mpOrderId,
  storeName,
  category,
  orderTitle,
  selectedApplicants,
  onSaved,
  onEffectiveSaved,
}: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [chatLoadingId, setChatLoadingId] = useState('')
  const initial = initBoardState()
  const [visitDates, setVisitDates] = useState<VisitDateDef[]>(initial.visitDates)
  const [columns, setColumns] = useState<ScheduleColumn[]>(initial.columns)
  const [shareTable, setShareTable] = useState(true)
  const [mealCount, setMealCount] = useState(1)
  const [tableSize, setTableSize] = useState(4)

  const selectedSlots = useMemo(() => slotStringsFromVisitDates(visitDates), [visitDates])

  const pool = useMemo(
    () =>
      (selectedApplicants || [])
        .filter((a) => a && a.id)
        .map((a) =>
          enrichApplicantPreference(String(a.id), applicantName(a), preferredTime(a), {
            talentMemberId: String(a.talentMemberId || '').trim() || undefined,
            avatar: String(a.wxAvatarUrl || a.avatarUrl || '').trim() || undefined,
          }),
        ),
    [selectedApplicants],
  )

  useEffect(() => {
    setColumns((prev) => {
      const byKey = new Map(prev.map((c) => [`${c.dateId}:${c.slotId}`, c]))
      const next: ScheduleColumn[] = []
      for (const day of visitDates) {
        for (const slot of day.slots) {
          const key = `${day.id}:${slot.id}`
          next.push(byKey.get(key) || { dateId: day.id, slotId: slot.id, tables: [{ id: 't1', talentIds: [] }] })
        }
      }
      return shareTable ? trimTablesToGlobalMax(next, Math.max(1, mealCount)) : next
    })
  }, [visitDates, shareTable, mealCount])

  useEffect(() => {
    const cap = shareTable ? Math.max(1, tableSize) : 1
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        tables: col.tables.map((t) => ({
          ...t,
          talentIds: t.talentIds.length > cap ? t.talentIds.slice(0, cap) : t.talentIds,
        })),
      })),
    )
  }, [tableSize, shareTable])

  useEffect(() => {
    if (!shareTable) {
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          tables: col.tables.length > 1 ? [col.tables[0]] : col.tables,
        })),
      )
      return
    }
    const maxTotal = Math.max(1, mealCount)
    setColumns((prev) => trimTablesToGlobalMax(prev, maxTotal))
  }, [mealCount, shareTable])

  async function onCommunicateTalent(person: ApplicantLite) {
    if (getActiveRole() !== 'pr') {
      window.alert('请先在「我的」切换为 PR 身份，再向达人发起沟通。')
      return
    }
    if (!canChat()) {
      window.alert('未配置后台 API，无法发起私信。')
      return
    }
    setChatLoadingId(person.id)
    try {
      await syncProfile()
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId], includePrOwned: true })
      const sessionId = await ensureSessionWithTalent(
        {
          id: person.id,
          talentMemberId: person.talentMemberId || person.id,
          name: person.name,
          avatar: person.avatar || '',
        },
        reg,
      )
      navigate(
        `/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(person.name)}` +
          `&peerAvatar=${encodeURIComponent(person.avatar || '')}` +
          `&peerId=${encodeURIComponent(person.talentMemberId || person.id)}` +
          `&peerTalentId=${encodeURIComponent(person.talentMemberId || person.id)}`,
      )
    } catch (e) {
      window.alert(formatChatError(e))
    } finally {
      setChatLoadingId('')
    }
  }

  async function ensureWorkflowAdvanced(confirmEffective: boolean) {
    if (!confirmEffective || !mpOrderId) return
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId], includePrOwned: true })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId) as Record<string, unknown> | undefined
      if (!mp) return
      if (resolvePrWorkflowStage(mp) === 'pending_video_review') return
      const patch = buildPrWorkflowOrderPatch(mp, buildScheduleCompletedPatch())
      await updateMpRecruitmentOrder({ ...(patch.order as Record<string, unknown>), id: String(patch.id || mpOrderId) })
      clearMpRegistryCache()
    } catch {
      /* API 已写入时忽略 */
    }
  }

  async function saveSchedule(rows: VisitScheduleRow[], assignMode: 'manual' | 'ai', confirmEffective: boolean) {
    if (!mpOrderId || !rows.length) {
      setErr('请先拖动达人到时段完成排期')
      return
    }
    setBusy(true)
    setErr('')
    setOkMsg('')
    try {
      const res = (await setVisitSchedule(mpOrderId, {
        mode: assignMode,
        rows: assignMode === 'manual' ? rows : undefined,
        aiRows:
          assignMode === 'ai'
            ? rows.map((r) => {
                const hit = pool.find((a) => a.id === r.applicantId)
                return {
                  time: r.time,
                  talentName: hit ? hit.name : r.applicantId,
                  talentId: r.applicantId,
                  storeName: r.storeName,
                  tableNote: r.tableNote,
                }
              })
            : undefined,
        visitSlots: selectedSlots,
        category,
        shareTable,
        mealCount,
        tableSize,
        storeName,
        notify: confirmEffective,
        confirmEffective,
      })) as { scheduleSource?: string; rows?: VisitScheduleRow[]; effective?: boolean }
      await ensureWorkflowAdvanced(confirmEffective)
      clearMpRegistryCache()
      onSaved()
      setOkMsg(
        confirmEffective
          ? '排期已确认生效，订单已移入「待视频审核」'
          : '排期草案已保存，可继续调整后确认生效',
      )
      if (confirmEffective) onEffectiveSaved?.()
      void res
    } catch (e) {
      setErr(e instanceof Error ? e.message : '排期失败')
    } finally {
      setBusy(false)
    }
  }

  async function runAiSchedule(confirmEffective: boolean) {
    if (!selectedSlots.length) {
      setErr('请至少添加一个有效时段')
      return
    }
    setBusy(true)
    setErr('')
    setOkMsg('')
    try {
      const res = (await setVisitSchedule(mpOrderId, {
        mode: 'ai',
        visitSlots: selectedSlots,
        category,
        shareTable,
        mealCount,
        tableSize,
        storeName,
        notify: confirmEffective,
        confirmEffective,
      })) as { rows?: VisitScheduleRow[]; effective?: boolean; scheduleSource?: string }

      let rows: VisitScheduleRow[] = Array.isArray(res.rows)
        ? res.rows.map((r) => ({
            applicantId: String(r.applicantId || ''),
            time: String(r.time || '').trim(),
            storeName: String(r.storeName || '').trim() || undefined,
            tableNote: String(r.tableNote || '').trim() || undefined,
          }))
        : []

      if (!rows.length) {
        const { rows: clientRows } = await generateAiVisitSchedule(selectedApplicants, {
          visitSlots: selectedSlots,
          storeName,
          shareTable,
          mealCount,
          tableSize,
          category,
          title: orderTitle,
        })
        rows = clientRows
      }

      if (!rows.length) {
        setErr('无已选达人可排期')
        return
      }

      if (!res.effective && confirmEffective) {
        await saveSchedule(rows, 'ai', true)
        return
      }

      await ensureWorkflowAdvanced(confirmEffective)
      clearMpRegistryCache()
      onSaved()
      setOkMsg(
        confirmEffective
          ? '排期已确认生效，订单已移入「待视频审核」'
          : 'AI 排期草案已生成，可手动微调后确认生效',
      )
      if (confirmEffective) onEffectiveSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 排期失败')
    } finally {
      setBusy(false)
    }
  }

  function manualRowsFromBoard(): VisitScheduleRow[] {
    return boardToScheduleRows(columns, visitDates, {
      storeName,
      shareTable,
      tableSize,
      mealCount,
    })
  }

  function onExportSchedule() {
    try {
      downloadVisitScheduleCsv(
        selectedApplicants,
        manualRowsFromBoard(),
        mpOrderId,
        orderTitle || storeName,
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '导出失败')
    }
  }

  if (!pool.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        请先「确认选择」并「通知已选达人」，达人提交探店意向后再进行排期。
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-surface)] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">探店排期</h3>
          <p className="text-xs text-[var(--shell-muted)] mt-1">
            手动模式：拖动达人至时段{shareTable ? '与桌位' : ''}；AI 模式：自动生成后可微调。
          </p>
        </div>
        <div className="flex gap-2 text-sm flex-wrap">
          <button type="button" className="px-3 py-1.5 rounded-lg border" onClick={onExportSchedule}>
            下载排期明细
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg border ${mode === 'manual' ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            onClick={() => setMode('manual')}
          >
            手动排期
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg border ${mode === 'ai' ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            onClick={() => setMode('ai')}
          >
            AI 智能排期
          </button>
        </div>
      </div>

      <label className="block text-sm max-w-xs">
        <span className="text-[var(--shell-muted)]">类目</span>
        <input className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input" value={category} readOnly />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={shareTable} onChange={(e) => setShareTable(e.target.checked)} />
        餐饮拼桌（多人一桌，可拖入同一桌）
      </label>
      {shareTable ? (
        <div className="grid gap-3 sm:grid-cols-2 text-sm max-w-md pl-6">
          <label className="block">
            <span className="text-[var(--shell-muted)]">餐食份数（全排期总桌数）</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
              value={mealCount}
              onChange={(e) => setMealCount(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="block">
            <span className="text-[var(--shell-muted)]">每桌人数</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
              value={tableSize}
              onChange={(e) => setTableSize(Math.max(1, Number(e.target.value) || 4))}
            />
          </label>
        </div>
      ) : null}

      <VisitScheduleDragBoard
        visitDates={visitDates}
        onVisitDatesChange={setVisitDates}
        columns={columns}
        onColumnsChange={setColumns}
        pool={pool}
        shareTable={shareTable}
        tableSize={tableSize}
        storeName={storeName}
        mealCount={mealCount}
        onCommunicate={(p) => void onCommunicateTalent(p)}
        chatLoadingId={chatLoadingId}
      />

      {mode === 'manual' ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="btn-mockup"
            onClick={() => void saveSchedule(manualRowsFromBoard(), 'manual', false)}
          >
            {busy ? '保存中…' : '保存排期草案'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="btn-mockup btn-mockup--primary"
            onClick={() => void saveSchedule(manualRowsFromBoard(), 'manual', true)}
          >
            {busy ? '确认中…' : '确认排期生效并通知达人'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="btn-mockup" onClick={() => void runAiSchedule(false)}>
            {busy ? '生成中…' : 'AI 生成草案'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="btn-mockup btn-mockup--primary"
            onClick={() => void runAiSchedule(true)}
          >
            {busy ? '生成中…' : 'AI 排期并确认生效'}
          </button>
        </div>
      )}

      {okMsg ? <p className="text-sm text-emerald-700">{okMsg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </section>
  )
}
