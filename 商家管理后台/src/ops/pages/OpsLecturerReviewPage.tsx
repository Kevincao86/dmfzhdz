import { useCallback, useEffect, useState } from 'react'
import { CourseDetailDialog, LecturerDetailDialog } from '../opsTrainingReviewDetail'
import { loadTrainingReview, postTrainingReview, reviewBucket, type LecturerRow, type TrainingCourseRow } from '../opsTrainingReviewApi'

const TABS = [
  { id: 'pending', label: '待审核' },
  { id: 'approved', label: '已通过' },
  { id: 'rejected', label: '已驳回' },
] as const

export default function OpsLecturerReviewPage() {
  const [rows, setRows] = useState<LecturerRow[]>([])
  const [courses, setCourses] = useState<TrainingCourseRow[]>([])
  const [openLecturer, setOpenLecturer] = useState<LecturerRow | null>(null)
  const [openCourse, setOpenCourse] = useState<TrainingCourseRow | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending')
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')
  const [rejectId, setRejectId] = useState('')
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(async () => {
    const data = await loadTrainingReview()
    setRows(data.lecturers.filter((row) => row.lecturerStatus && row.lecturerStatus !== 'none'))
    setCourses(data.courses)
  }, [])

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [load])

  async function review(hostId: string, status: 'approved' | 'rejected', note = '') {
    setBusyId(hostId)
    setErr('')
    try {
      await postTrainingReview({ action: 'reviewLecturer', hostId, status, note })
      setRejectId('')
      setRejectNote('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '审核失败')
    } finally {
      setBusyId('')
    }
  }

  const shown = rows.filter((row) => reviewBucket(row.lecturerStatus) === tab)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">讲师审核</h1>
        <p className="ops-muted mt-1 text-sm">只处理讲师资格。通过后才能审核他的课程。驳回必须写原因，对方能在申请页看到。</p>
      </div>
      {err ? <p className="ops-hint-warn text-sm">{err}</p> : null}
      <div className="flex gap-2">
        {TABS.map((item) => {
          const count = rows.filter((row) => reviewBucket(row.lecturerStatus) === item.id).length
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
          const bucket = reviewBucket(row.lecturerStatus)
          const incomplete = !row.city?.trim() || !row.intro?.trim()
          return (
            <article key={row.hostId} className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4 shadow-[var(--ops-card-shadow)]">
              <button type="button" className="w-full text-left" onClick={() => { setOpenLecturer(row); setOpenCourse(null) }}>
              <h2 className="font-semibold">{row.name || '未填姓名'} · {row.city || '未填城市'}</h2>
              <p className="ops-muted mt-1 text-sm">{row.platforms || '未填平台'}{row.years ? ` · ${row.years}` : ''}</p>
              <p className="mt-2 text-sm leading-relaxed">{row.skills || '未填擅长'}</p>
              <p className="mt-2 text-sm leading-relaxed">{row.intro || '未填写介绍'}</p>
              {row.lecturerNote ? <p className="ops-hint-warn mt-2 text-sm">驳回原因：{row.lecturerNote}</p> : null}
              <p className="ops-muted mt-2 text-xs">查看详情</p>
              </button>
              {bucket === 'pending' && incomplete ? <p className="ops-hint-warn mt-2 text-sm">城市或介绍为空，不能通过。</p> : null}
              {rejectId === row.hostId ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    className="w-full rounded-xl border border-[var(--ops-border)] bg-[var(--ops-bg)] px-3 py-2 text-sm"
                    rows={2}
                    placeholder="驳回原因，对方能看到"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button type="button" className="ops-btn-soft" disabled={busyId === row.hostId || !rejectNote.trim()} onClick={() => review(row.hostId, 'rejected', rejectNote.trim())}>
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
                      disabled={busyId === row.hostId || incomplete}
                      className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                      onClick={() => review(row.hostId, 'approved')}
                    >
                      {bucket === 'rejected' ? '重新通过' : '通过'}
                    </button>
                  ) : null}
                  {bucket !== 'rejected' ? (
                    <button type="button" disabled={busyId === row.hostId} className="ops-btn-soft" onClick={() => { setRejectId(row.hostId); setRejectNote('') }}>
                      驳回
                    </button>
                  ) : null}
                </div>
              )}
            </article>
          )
        })}
        {!shown.length ? <p className="ops-muted py-8 text-center text-sm">{tab === 'pending' ? '没有待审核的讲师申请。' : '这一栏是空的。'}</p> : null}
      </div>
      {openCourse ? (
        <CourseDetailDialog
          row={openCourse}
          lecturer={openLecturer || undefined}
          onBack={openLecturer ? () => setOpenCourse(null) : undefined}
          onClose={() => { setOpenCourse(null); setOpenLecturer(null) }}
        />
      ) : openLecturer ? (
        <LecturerDetailDialog
          row={openLecturer}
          courses={courses}
          onOpenCourse={setOpenCourse}
          onClose={() => setOpenLecturer(null)}
        />
      ) : null}
    </div>
  )
}
