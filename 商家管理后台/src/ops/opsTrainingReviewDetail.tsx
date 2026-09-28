import type { ReactNode } from 'react'
import type { LecturerRow, TrainingCourseRow } from './opsTrainingReviewApi'

const STATUS_LABEL = { pending: '待审核', approved: '已通过', rejected: '已驳回' } as const

function statusLabel(status?: string) {
  if (status === 'approved' || status === 'rejected' || status === 'pending') return STATUS_LABEL[status]
  return '待审核'
}

function DetailShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="ops-btn-soft" onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="ops-muted">{label}：</span>
      {value?.trim() || '未填'}
    </p>
  )
}

export function LecturerDetailDialog({
  row,
  courses,
  onClose,
  onOpenCourse,
}: {
  row: LecturerRow
  courses: TrainingCourseRow[]
  onClose: () => void
  onOpenCourse: (course: TrainingCourseRow) => void
}) {
  const mine = courses.filter((course) => String(course.hostId || '').trim() === String(row.hostId || '').trim())
  return (
    <DetailShell title="讲师详情" onClose={onClose}>
      <div className="mt-4 flex gap-4">
        {row.avatar ? (
          <img src={row.avatar} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="ops-muted flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--ops-bg)] text-xs">无头像</div>
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold">{row.name || '未填姓名'} · {row.city || '未填城市'}</p>
          <p className="ops-muted mt-1 text-sm">{statusLabel(row.lecturerStatus)}{row.years ? ` · 从业 ${row.years}` : ''}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Field label="平台" value={row.platforms} />
        <Field label="擅长" value={row.skills} />
        <Field label="介绍" value={row.intro} />
        {row.lecturerNote ? <p className="ops-hint-warn text-sm">驳回原因：{row.lecturerNote}</p> : null}
      </div>
      <h3 className="mt-5 text-sm font-semibold">培训课程 {mine.length}</h3>
      <div className="mt-2 space-y-2">
        {mine.map((course) => (
          <button
            key={course.id}
            type="button"
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--ops-border)] bg-[var(--ops-bg)] p-3 text-left"
            onClick={() => onOpenCourse(course)}
          >
            {course.poster ? <img src={course.poster} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" /> : null}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{course.title}</span>
              <span className="ops-muted mt-0.5 block text-xs">
                {course.mode === 'offline' ? '线下' : '线上'} · {statusLabel(course.reviewStatus)}
              </span>
            </span>
          </button>
        ))}
        {!mine.length ? <p className="ops-muted text-sm">还没有提交课程。</p> : null}
      </div>
    </DetailShell>
  )
}

export function CourseDetailDialog({
  row,
  lecturer,
  onClose,
  onBack,
}: {
  row: TrainingCourseRow
  lecturer?: LecturerRow
  onClose: () => void
  onBack?: () => void
}) {
  return (
    <DetailShell title="培训课程详情" onClose={onClose}>
      {onBack ? (
        <button type="button" className="ops-btn-soft mt-3" onClick={onBack}>返回讲师</button>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {row.poster ? <img src={row.poster} alt="" className="aspect-video w-full rounded-xl object-cover" /> : <div className="ops-muted flex aspect-video items-center justify-center rounded-xl bg-[var(--ops-bg)] text-sm">无星选海报</div>}
        {row.posterMp ? <img src={row.posterMp} alt="" className="aspect-[32/10] w-full rounded-xl object-cover" /> : <div className="ops-muted flex aspect-[32/10] items-center justify-center rounded-xl bg-[var(--ops-bg)] text-sm">无小程序海报</div>}
      </div>
      <h3 className="mt-4 text-base font-semibold">{row.title}</h3>
      <div className="mt-3 space-y-2">
        <Field label="状态" value={statusLabel(row.reviewStatus)} />
        <Field label="讲师" value={row.hostName || lecturer?.name} />
        <Field label="讲师城市" value={lecturer?.city} />
        <Field label="形式" value={row.mode === 'offline' ? '线下' : '线上'} />
        <Field label="城市" value={row.city} />
        {row.mode === 'offline' ? <Field label="具体地址" value={row.address} /> : null}
        {row.mode === 'offline' ? <Field label="项目联系人" value={row.contactName} /> : null}
        {row.mode === 'offline' ? <Field label="联系方式" value={row.contactWay} /> : null}
        <Field label="上课时间" value={row.whenText} />
        <Field label="课时费" value={row.fee ? `¥${row.fee}` : ''} />
        <Field label="名额" value={row.seats != null ? `${row.signupCount || 0}/${row.seats}` : ''} />
        <Field label="课程说明" value={row.note} />
        <Field label="报名字段" value={(row.signupFields || []).map((field) => field.label).filter(Boolean).join('、')} />
        {row.reviewNote ? <p className="ops-hint-warn text-sm">驳回原因：{row.reviewNote}</p> : null}
      </div>
    </DetailShell>
  )
}
