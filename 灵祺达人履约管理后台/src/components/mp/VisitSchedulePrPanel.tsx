import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  appendTalentInbox,
  clearMpRegistryCache,
  fetchMpRegistry,
  updateMpRecruitmentOrder,
} from '../../lib/mpApi'
import { resolveTalentInboxTarget } from '../../lib/mpSync/talentInboxMatch'
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
  applyScheduleRowsToBoard,
  boardToScheduleRows,
  enrichApplicantPreference,
  hydrateBoardFromApplicants,
  initColumns,
  initVisitDates,
  initVisitDatesFromPlanMeta,
  normalizeScheduleRowsToPlan,
  scheduleRowsFromApplicants,
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
  mpOrder?: Record<string, unknown> | null
  onSaved: () => void
  onEffectiveSaved?: (talentCount?: number) => void
  /** review：待视频审核查看/修改排期与签到 */
  purpose?: 'schedule' | 'review'
}

function applicantName(a: Record<string, unknown>): string {
  return String(a.platformNickname || a.name || a.platformAccount || a.id || '').trim()
}

function preferredTime(a: Record<string, unknown>): string {
  return String(a.talentPreferredVisitAt || a.visitTimeSlot || '').trim()
}

function initBoardState(applicants?: Record<string, unknown>[], mp?: Record<string, unknown> | null) {
  if (applicants?.some((a) => a && String(a.assignedVisitAt || '').trim())) {
    const hydrated = hydrateBoardFromApplicants(applicants)
    return {
      visitDates: hydrated.visitDates,
      columns: hydrated.columns,
      shareTable: hydrated.shareTable,
      mealCount: hydrated.mealCount,
      tableSize: hydrated.tableSize,
    }
  }
  const fromPlan = initVisitDatesFromPlanMeta(mp)
  if (fromPlan) {
    const meta =
      mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
        ? ((mp.mpPublishMeta as Record<string, unknown>).visitScheduleMeta as Record<string, unknown> | undefined)
        : undefined
    return {
      visitDates: fromPlan,
      columns: initColumns(fromPlan, { shareTable: meta?.shareTable !== false }),
      shareTable: meta?.shareTable !== false,
      mealCount: Math.max(1, Number(meta?.mealCount) || 1),
      tableSize: Math.max(2, Number(meta?.tableSize) || 4),
    }
  }
  const visitDates = initVisitDates()
  return {
    visitDates,
    columns: initColumns(visitDates, { shareTable: true }),
    shareTable: true,
    mealCount: 1,
    tableSize: 4,
  }
}

function scheduleSnapshotKey(
  applicantId: string,
  time: string,
  storeName?: string,
  tableNote?: string,
): string {
  return `${applicantId}|${String(time || '').trim()}|${String(storeName || '').trim()}|${String(tableNote || '').trim()}`
}

function baselineFromApplicants(applicants: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of applicants || []) {
    if (!a || !a.id) continue
    const id = String(a.id)
    const assigned = String(a.assignedVisitAt || '').trim()
    if (!assigned) continue
    m.set(
      id,
      scheduleSnapshotKey(
        id,
        assigned,
        String(a.assignedVisitStore || '').trim(),
        String(a.tableNote || '').trim(),
      ),
    )
  }
  return m
}

function rowsToNotify(
  rows: VisitScheduleRow[],
  baseline: Map<string, string>,
  reviewOnly: boolean,
): VisitScheduleRow[] {
  if (!reviewOnly) return rows
  return rows.filter((r) => {
    const cur = scheduleSnapshotKey(r.applicantId, r.time, r.storeName, r.tableNote)
    const prev = baseline.get(String(r.applicantId))
    return !prev || prev !== cur
  })
}

function checkInStatusLabel(a: Record<string, unknown>): { text: string; tone: 'ok' | 'pending' | 'none' } {
  const checkedIn = String(a.visitCheckInAt || '').trim()
  const assigned = String(a.assignedVisitAt || '').trim()
  if (checkedIn) return { text: `已签到 ${checkedIn}`, tone: 'ok' }
  if (assigned) return { text: '待签到', tone: 'pending' }
  return { text: '未排期', tone: 'none' }
}

export default function VisitSchedulePrPanel({
  mpOrderId,
  storeName,
  category,
  orderTitle,
  selectedApplicants,
  mpOrder,
  onSaved,
  onEffectiveSaved,
  purpose = 'schedule',
}: Props) {
  const isReview = purpose === 'review'
  const navigate = useNavigate()
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [chatLoadingId, setChatLoadingId] = useState('')
  const initial = initBoardState(isReview ? selectedApplicants : undefined, mpOrder)
  const [visitDates, setVisitDates] = useState<VisitDateDef[]>(initial.visitDates)
  const [columns, setColumns] = useState<ScheduleColumn[]>(initial.columns)
  const [shareTable, setShareTable] = useState(initial.shareTable)
  const [mealCount, setMealCount] = useState(initial.mealCount)
  const [tableSize, setTableSize] = useState(initial.tableSize)
  const [hydrated, setHydrated] = useState(isReview)
  const scheduleBaselineRef = useRef<Map<string, string>>(baselineFromApplicants(selectedApplicants))

  useEffect(() => {
    scheduleBaselineRef.current = baselineFromApplicants(selectedApplicants)
  }, [selectedApplicants])

  useEffect(() => {
    if (!isReview || hydrated) return
    const next = initBoardState(selectedApplicants)
    setVisitDates(next.visitDates)
    setColumns(next.columns)
    setShareTable(next.shareTable)
    setMealCount(next.mealCount)
    setTableSize(next.tableSize)
    setHydrated(true)
  }, [isReview, hydrated, selectedApplicants])

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
          next.push(
            byKey.get(key) || {
              dateId: day.id,
              slotId: slot.id,
              tables: shareTable ? [] : [{ id: 't1', talentIds: [] }],
            },
          )
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

  async function notifyTalentsSchedule(rows: VisitScheduleRow[], reviewOnly: boolean) {
    const notifyRows = rowsToNotify(rows, scheduleBaselineRef.current, reviewOnly)
    if (!notifyRows.length) return
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId], includePrOwned: true })
      const entries = []
      for (const row of notifyRows) {
        const applicant = (selectedApplicants || []).find((a) => a && String(a.id) === row.applicantId)
        if (!applicant) continue
        const target = resolveTalentInboxTarget(applicant, reg)
        if (!target.talentMemberId) continue
        const mpId = String(mpOrderId || '').trim()
        const appId = String(target.applicantId || row.applicantId || '').trim()
        entries.push({
          talentMemberId: target.talentMemberId,
          contact: target.contact,
          platformAccount: target.platformAccount,
          applicantId: appId,
          mpOrderId,
          category: 'order' as const,
          title: reviewOnly ? '探店排期已更新' : '探店排期已确认',
          body: `${row.time} · ${row.storeName || storeName}\n${row.tableNote || '请按时到店探店'}`,
          noticeType: 'schedule' as const,
          pinned: true,
        })
      }
      if (entries.length) await appendTalentInbox(entries)
      for (const row of notifyRows) {
        scheduleBaselineRef.current.set(
          String(row.applicantId),
          scheduleSnapshotKey(row.applicantId, row.time, row.storeName, row.tableNote),
        )
      }
    } catch {
      /* API 已写入站内信时忽略 */
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
      const notifyRows = rowsToNotify(rows, scheduleBaselineRef.current, isReview)
      const notifyIds = notifyRows.map((r) => String(r.applicantId)).filter(Boolean)
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
        notify: confirmEffective && notifyRows.length > 0,
        notifyApplicantIds: isReview ? notifyIds : undefined,
        confirmEffective,
      })) as { scheduleSource?: string; rows?: VisitScheduleRow[]; effective?: boolean }
      await ensureWorkflowAdvanced(confirmEffective)
      if (confirmEffective) {
        for (const row of notifyRows) {
          scheduleBaselineRef.current.set(
            String(row.applicantId),
            scheduleSnapshotKey(row.applicantId, row.time, row.storeName, row.tableNote),
          )
        }
      }
      clearMpRegistryCache()
      onSaved()
      if (confirmEffective) {
        if (isReview) {
          setOkMsg(
            notifyRows.length
              ? `排期已更新并通知 ${notifyRows.length} 位达人`
              : '排期已保存（无变更，未发送通知）',
          )
        } else {
          onEffectiveSaved?.(rows.length)
        }
        return
      }
      setOkMsg('排期草案已保存，可继续调整后确认生效')
      void res
    } catch (e) {
      if (confirmEffective) {
        const notifyRows = rowsToNotify(rows, scheduleBaselineRef.current, isReview)
        if (notifyRows.length) {
          try {
            await notifyTalentsSchedule(rows, isReview)
          } catch {
            /* ignore */
          }
        }
      }
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
      let rows: VisitScheduleRow[] = []
      let source: 'ai' | 'rule' = 'rule'

      try {
        const res = (await setVisitSchedule(mpOrderId, {
          mode: 'ai',
          visitSlots: selectedSlots,
          category,
          shareTable,
          mealCount,
          tableSize,
          storeName,
          notify: false,
          confirmEffective: false,
        })) as { rows?: VisitScheduleRow[]; scheduleSource?: string }

        if (Array.isArray(res.rows) && res.rows.length) {
          rows = res.rows.map((r) => ({
            applicantId: String(r.applicantId || ''),
            time: String(r.time || '').trim(),
            storeName: String(r.storeName || '').trim() || undefined,
            tableNote: String(r.tableNote || '').trim() || undefined,
          }))
          source = res.scheduleSource === 'ai' ? 'ai' : 'rule'
        }
      } catch {
        /* 走客户端 AI/规则 */
      }

      if (!rows.length) {
        const gen = await generateAiVisitSchedule(selectedApplicants, {
          visitSlots: selectedSlots,
          storeName,
          shareTable,
          mealCount,
          tableSize,
          category,
          title: orderTitle,
        })
        rows = gen.rows
        source = gen.source
      }

      if (!rows.length) {
        setErr('无已选达人可排期')
        return
      }

      rows = normalizeScheduleRowsToPlan(rows, visitDates, selectedSlots)
      const nextColumns = applyScheduleRowsToBoard(columns, visitDates, rows, {
        shareTable,
        tableSize,
        mealCount,
      })
      setColumns(nextColumns)

      if (confirmEffective) {
        const boardRows = boardToScheduleRows(nextColumns, visitDates, {
          storeName,
          shareTable,
          tableSize,
          mealCount,
        })
        await saveSchedule(boardRows.length ? boardRows : rows, 'ai', true)
        return
      }

      setOkMsg(
        source === 'ai'
          ? 'AI 已根据达人意向与桌位设置自动排入下方，可微调后确认生效'
          : '已按达人意向与可用时段自动排入下方，可微调后确认生效',
      )
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

  function exportRows(): VisitScheduleRow[] {
    const fromBoard = manualRowsFromBoard()
    if (fromBoard.length) return fromBoard
    return scheduleRowsFromApplicants(selectedApplicants, storeName)
  }

  function onExportSchedule() {
    try {
      downloadVisitScheduleCsv(
        selectedApplicants,
        exportRows(),
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
          <h3 className="font-medium">{isReview ? '查看排期' : '探店排期'}</h3>
          <p className="text-xs text-[var(--shell-muted)] mt-1">
            {isReview
              ? '查看达人探店签到情况；可下载排期明细，或由招募方修改排期后通知达人（达人端不可自行修改）。'
              : `手动模式：拖动达人至时段${shareTable ? '与桌位' : ''}；AI 模式：自动生成后可微调。`}
          </p>
        </div>
        <div className="flex gap-2 text-sm flex-wrap">
          <button type="button" className="px-3 py-1.5 rounded-lg border" onClick={onExportSchedule}>
            下载排期明细
          </button>
          {!isReview ? (
            <>
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
                disabled={busy}
                onClick={() => {
                  setMode('ai')
                  void runAiSchedule(false)
                }}
              >
                {busy && mode === 'ai' ? 'AI 排期中…' : 'AI 智能排期'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isReview ? (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b text-sm font-medium">达人探店签到</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--shell-muted)] border-b">
                  <th className="px-3 py-2 font-medium">达人</th>
                  <th className="px-3 py-2 font-medium">确认排期</th>
                  <th className="px-3 py-2 font-medium">签到状态</th>
                </tr>
              </thead>
              <tbody>
                {selectedApplicants.map((a) => {
                  const status = checkInStatusLabel(a)
                  return (
                    <tr key={String(a.id)} className="border-b last:border-0">
                      <td className="px-3 py-2">{applicantName(a)}</td>
                      <td className="px-3 py-2">{String(a.assignedVisitAt || '—')}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            status.tone === 'ok'
                              ? 'text-emerald-700'
                              : status.tone === 'pending'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }
                        >
                          {status.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
        datesLocked={true}
      />

      {mode === 'manual' || isReview ? (
        <div className="flex flex-wrap gap-2">
          {!isReview ? (
            <button
              type="button"
              disabled={busy}
              className="btn-mockup"
              onClick={() => void saveSchedule(manualRowsFromBoard(), 'manual', false)}
            >
              {busy ? '保存中…' : '保存排期草案'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="btn-mockup btn-mockup--primary"
            onClick={() => void saveSchedule(manualRowsFromBoard(), 'manual', true)}
          >
            {busy ? '保存中…' : isReview ? '保存排期修改并通知达人' : '确认排期生效并通知达人'}
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
