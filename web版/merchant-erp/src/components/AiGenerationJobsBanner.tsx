import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import {
  dismissAiGenerationJob,
  getActiveAiGenerationJobs,
  listAiGenerationJobs,
  subscribeAiGenerationJobs,
  type AiGenerationJob,
} from '../lib/aiGenerationJobs'

function JobRow({ job, onDismiss }: { job: AiGenerationJob; onDismiss: () => void }) {
  const running = job.status === 'running'
  const failed = job.status === 'failed'
  const route = job.route?.trim()

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm',
        running && 'border-blue-200 bg-blue-50/95 text-blue-950',
        failed && 'border-red-200 bg-red-50/95 text-red-900',
        !running && !failed && 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
      )}
    >
      {running ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" />
      ) : failed ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{job.label}</p>
        <p className="mt-0.5 text-xs opacity-90">
          {running
            ? job.progress || '后台生成中，可切换其他页面…'
            : failed
              ? job.error || '生成失败'
              : '已完成，返回原页面查看结果'}
        </p>
        {route && running ? (
          <Link to={route} className="mt-1 inline-block text-xs font-medium text-blue-700 underline">
            返回生成页
          </Link>
        ) : null}
      </div>
      {!running ? (
        <button
          type="button"
          aria-label="关闭"
          onClick={onDismiss}
          className="rounded p-0.5 opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

/** 全局浮层：有进行中/刚完成的后台 AI 任务时展示 */
export default function AiGenerationJobsBanner() {
  const [jobs, setJobs] = useState<AiGenerationJob[]>([])

  useEffect(() => {
    const sync = () => {
      const active = getActiveAiGenerationJobs()
      const recent = listAiGenerationJobs()
        .filter((j) => j.status !== 'running')
        .slice(0, 2)
      setJobs([...active, ...recent])
    }
    sync()
    return subscribeAiGenerationJobs(sync)
  }, [])

  if (!jobs.length) return null

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[70] flex w-[min(100vw-2rem,22rem)] flex-col gap-2">
      {jobs.map((job) => (
        <div key={job.id} className="pointer-events-auto">
          <JobRow job={job} onDismiss={() => dismissAiGenerationJob(job.id)} />
        </div>
      ))}
    </div>
  )
}
