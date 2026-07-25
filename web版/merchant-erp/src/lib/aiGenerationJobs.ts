/**
 * 跨页面 AI 生成任务：fetch / 轮询在模块级继续，切页不中断。
 */
export type AiGenerationJobKind =
  | 'ops_plan'
  | 'short_video'
  | 'ai_image'
  | 'viral_brief'
  | 'digital_human'

export type AiGenerationJobStatus = 'running' | 'succeeded' | 'failed'

export type AiGenerationJob = {
  id: string
  kind: AiGenerationJobKind
  label: string
  status: AiGenerationJobStatus
  progress?: string
  error?: string
  route?: string
  startedAt: number
  finishedAt?: number
}

const STORAGE_KEY = 'meoo_ai_generation_jobs_v1'
const RESULT_PREFIX = 'meoo_ai_generation_result_v1:'

const jobs = new Map<string, AiGenerationJob>()
const resultStore = new Map<string, unknown>()
const listeners = new Set<() => void>()

function sessionStore(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

function persistJobs() {
  const ss = sessionStore()
  if (!ss) return
  try {
    const list = listAiGenerationJobs().slice(0, 24)
    ss.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function hydrateJobs() {
  const ss = sessionStore()
  if (!ss) return
  try {
    const raw = ss.getItem(STORAGE_KEY)
    if (!raw) return
    const list = JSON.parse(raw) as AiGenerationJob[]
    if (!Array.isArray(list)) return
    for (const j of list) {
      if (!j?.id || !j.kind) continue
      jobs.set(j.id, j)
    }
  } catch {
    /* ignore */
  }
}

hydrateJobs()

export function subscribeAiGenerationJobs(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function listAiGenerationJobs(): AiGenerationJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt)
}

export function getActiveAiGenerationJobs(): AiGenerationJob[] {
  return listAiGenerationJobs().filter((j) => j.status === 'running')
}

export function getAiGenerationJob(id: string): AiGenerationJob | undefined {
  return jobs.get(id)
}

export function findRunningAiGenerationJob(kind: AiGenerationJobKind): AiGenerationJob | undefined {
  return listAiGenerationJobs().find((j) => j.kind === kind && j.status === 'running')
}

export function startAiGenerationJob(
  meta: Pick<AiGenerationJob, 'kind' | 'label'> & { route?: string },
): string {
  const id = `${meta.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  jobs.set(id, {
    id,
    kind: meta.kind,
    label: meta.label,
    route: meta.route,
    status: 'running',
    startedAt: Date.now(),
  })
  persistJobs()
  notify()
  return id
}

export function updateAiGenerationJob(id: string, patch: Partial<AiGenerationJob>): void {
  const j = jobs.get(id)
  if (!j) return
  jobs.set(id, { ...j, ...patch })
  persistJobs()
  notify()
}

export function finishAiGenerationJob(id: string, ok: boolean, error?: string): void {
  updateAiGenerationJob(id, {
    status: ok ? 'succeeded' : 'failed',
    error: ok ? undefined : error?.slice(0, 200),
    finishedAt: Date.now(),
  })
  const later = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : null
  later?.(() => {
    const cur = jobs.get(id)
    if (cur?.status === 'succeeded') {
      jobs.delete(id)
      persistJobs()
      notify()
    }
  }, 45_000)
}

export function dismissAiGenerationJob(id: string): void {
  jobs.delete(id)
  persistJobs()
  notify()
}

export function storeAiGenerationResult<T>(jobId: string, payload: T): void {
  resultStore.set(jobId, payload)
  const ss = sessionStore()
  if (!ss) return
  try {
    ss.setItem(`${RESULT_PREFIX}${jobId}`, JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekAiGenerationResult<T>(jobId: string): T | null {
  if (resultStore.has(jobId)) return resultStore.get(jobId) as T
  const ss = sessionStore()
  if (!ss) return null
  try {
    const raw = ss.getItem(`${RESULT_PREFIX}${jobId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as T
    resultStore.set(jobId, parsed)
    return parsed
  } catch {
    return null
  }
}

export function consumeAiGenerationResult<T>(jobId: string): T | null {
  const hit = peekAiGenerationResult<T>(jobId)
  if (hit == null) return null
  resultStore.delete(jobId)
  const ss = sessionStore()
  if (ss) {
    try {
      ss.removeItem(`${RESULT_PREFIX}${jobId}`)
    } catch {
      /* ignore */
    }
  }
  return hit
}

export function consumeLatestAiGenerationResultForKind<T>(kind: AiGenerationJobKind): {
  jobId: string
  payload: T
} | null {
  const finished = listAiGenerationJobs().filter(
    (j) => j.kind === kind && j.status !== 'running' && j.finishedAt,
  )
  for (const j of finished) {
    const payload = consumeAiGenerationResult<T>(j.id)
    if (payload != null) {
      dismissAiGenerationJob(j.id)
      return { jobId: j.id, payload }
    }
  }
  return null
}

export function aiGenerationJobKindLabel(kind: AiGenerationJobKind): string {
  switch (kind) {
    case 'ops_plan':
      return 'AI 运营方案'
    case 'short_video':
      return '短视频生成'
    case 'ai_image':
      return 'AI 视觉工坊'
    case 'viral_brief':
      return '爆款 Brief'
    case 'digital_human':
      return '数字人口播'
    default:
      return 'AI 生成'
  }
}
