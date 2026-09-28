import { useCallback, useEffect, useState } from 'react'
import { loadTrainingReview, postTrainingReview, reviewBucket, type LecturerRow, type TrainingCourseRow } from '../opsTrainingReviewApi'

const TABS = [
  { id: 'pending', label: '待审核' },
  { id: 'approved', label: '已通过' },
  { id: 'rejected', label: '已驳回' },
] as const

export default function OpsTrainingReviewPage() {
  const [rows, setRows] = useState<TrainingCourseRow[]>([])
  const [lecturers, setLecturers] = useState<LecturerRow[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending')
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')
  const [rejectId, setRejectId] = useState('')
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(async () => {
    const data = await loadTrainingReview()
    setRows(data.courses)
    setLecturers(data.lecturers)
  }, [])

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [load])

  function lecturerReady(hostId?: string) {
    const id = String(hostId || '').trim()
    return lecturers.some((row) => String(row.hostId || '').trim() === id && row.lecturerStatus === 'approved')
  }

  async function review(id: string, status: 'approved' | 'rejected', note = '') {
    setBusyId(id)
    setErr('')
    try {
      await postTrainingReview({ action: 'review', id, status, note })
      setRejectId('')
      setRejectNote('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败')
    } finally {
      setBusyId('')
    }
  }

  const shown = rows.filter((row) => reviewBucket(row.reviewStatus) === tab)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">培训审核</h1>
        <p className="ops-muted mt-1 text-sm">只处理课程。讲师未通过时不能上架。驳回必须写原因，通过后带海报的课可以进首页广告栏。</p>
      </div>
      {err ? <p className="ops-hint-warn text-sm">{err}</p> : null}
      <div className="flex gap-2">
        {TABS.map((item) => {
          const count = rows.filter((row) => reviewBucket(row.reviewStatus) === item.id).length
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'rounded-full bg-violet-600 px-3 py-1 text-sm text-white' : 'ops-btn-soft'}
              onClick={() => setTab(item.id)}
            >
              {item.label} {count}
            </button>
          )
        })}
      </div>
      <div className="space-y-3">
        {shown.map((row) => {
          const bucket = reviewBucket(row.reviewStatus)
          const ready = lecturerReady(row.hostId)
          return (
            <article key={row.id} className="flex gap-4 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4 shadow-[var(--ops-card-shadow)]">
              {row.poster ? (
                <img src={row.poster} alt="" className="h-24 w-40 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="ops-muted flex h-24 w-40 shrink-0 items-center justify-center rounded-xl bg-[var(--ops-bg)] text-xs">无海报</div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{row.title}</h2>
                <p className="ops-muted mt-1 text-sm">
                  {row.hostName} · {row.mode === 'offline' ? '线下' : '线上'}
                  {row.city ? ` · ${row.city}` : ''} · ¥{row.fee || '0'}
                </p>
                {row.mode === 'offline' && (row.address || row.contactName || row.contactWay) ? (
                  <p className="mt-1 text-sm">{[row.address, row.contactName, row.contactWay].filter(Boolean).join(' · ')}</p>
                ) : null}
                {row.note ? <p className="mt-2 text-sm leading-relaxed">{row.note}</p> : null}
                {row.reviewNote ? <p className="ops-hint-warn mt-2 text-sm">驳回原因：{row.reviewNote}</p> : null}
                {!ready ? <p className="ops-hint-warn mt-2 text-sm">这位讲师还没通过，课程不能上架。</p> : null}
                {rejectId === row.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="w-full rounded-xl border border-[var(--ops-border)] bg-[var(--ops-bg)] px-3 py-2 text-sm"
                      rows={2}
                      placeholder="驳回原因，讲师能看到"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="ops-btn-soft" disabled={busyId === row.id || !rejectNote.trim()} onClick={() => review(row.id, 'rejected', rejectNote.trim())}>
                        确认驳回
                      </button>
                      <button type="button" className="ops-btn-soft" onClick={() => setRejectId('')}>取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {bucket !== 'approved' ? (
                      <button
                        type="button"
                        disabled={busyId === row.id || !ready}
                        className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={() => review(row.id, 'approved')}
                      >
                        {bucket === 'rejected' ? '重新通过' : '通过'}
                      </button>
                    ) : null}
                    {bucket !== 'rejected' ? (
                      <button type="button" disabled={busyId === row.id} className="ops-btn-soft" onClick={() => { setRejectId(row.id); setRejectNote('') }}>
                        {bucket === 'approved' ? '驳回下架' : '驳回'}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </article>
          )
        })}
        {!shown.length ? <p className="ops-muted py-8 text-center text-sm">{tab === 'pending' ? '没有待审核的课程。' : '这一栏是空的。'}</p> : null}
      </div>
    </div>
  )
}
