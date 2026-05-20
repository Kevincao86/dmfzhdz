import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../cn'
import {
  downloadIceExportBlob,
  fetchAliyunIceCloudConfig,
  fetchIceJobStatus,
  ICE_ASPECT_PRESETS,
  postIcePipeline,
  type IceBatchJob,
  type AliyunIceCloudConfig,
} from '../services/aliyunIceCloudApi'

const POLL_MS = 5000
const POLL_MAX = 120

const PHASE_LABEL: Record<IceBatchJob['phase'], string> = {
  pending: '待提交',
  pipeline: '上传合成',
  polling: '云端剪辑',
  done: '可下载',
  failed: '失败',
}

function newJobId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function parseUrlLines(text: string): string[] {
  return text
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

function formatProgress(p?: number): string {
  if (p == null || Number.isNaN(p)) return ''
  const n = p <= 1 ? Math.round(p * 100) : Math.round(p)
  return ` ${n}%`
}

type Props = {
  lastResultUrl?: string | null
}

export function ShortVideoIceBatchPanel({ lastResultUrl }: Props) {
  const [cfg, setCfg] = useState<AliyunIceCloudConfig | null>(null)
  const [urlText, setUrlText] = useState('')
  const [editBrief, setEditBrief] = useState('')
  const [jobs, setJobs] = useState<IceBatchJob[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const [aspectId, setAspectId] = useState<(typeof ICE_ASPECT_PRESETS)[number]['id']>('9:16')
  const [clipEndSec, setClipEndSec] = useState(10)
  const [preset, setPreset] = useState('无附加特效')

  const aspect = useMemo(
    () => ICE_ASPECT_PRESETS.find((a) => a.id === aspectId) ?? ICE_ASPECT_PRESETS[0],
    [aspectId],
  )

  const presetOptions = cfg?.effectOptions?.map((o) => o.label) ?? cfg?.presets ?? ['无附加特效', '淡入淡出']

  const pendingCount = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed').length
  const doneJobs = jobs.filter((j) => j.phase === 'done')
  const latestDone = doneJobs.length > 0 ? doneJobs[doneJobs.length - 1] : null
  const briefOk = editBrief.trim().length >= 4
  const canSubmit = cfg?.configured && pendingCount > 0 && briefOk && !busy

  useEffect(() => {
    void fetchAliyunIceCloudConfig().then((c) => {
      setCfg(c)
      if (c?.presets?.[0]) setPreset(c.presets[0])
    })
  }, [])

  const addUrlsFromText = useCallback(() => {
    const urls = parseUrlLines(urlText)
    if (urls.length === 0) {
      setErr('请粘贴至少一条公网可访问的 https 音视频地址')
      return
    }
    setErr(null)
    setJobs((prev) => [
      ...prev,
      ...urls.map((mediaUrl, i) => ({
        id: newJobId(),
        label: `素材 ${prev.length + i + 1}`,
        mediaUrl,
        phase: 'pending' as const,
      })),
    ])
    setUrlText('')
    setHint(`已加入 ${urls.length} 条素材，填写剪辑指令后即可提交`)
  }, [urlText])

  const appendLastResult = useCallback(() => {
    const u = lastResultUrl?.trim()
    if (!u || !/^https?:\/\//i.test(u)) {
      setErr('当前没有可用的 HTTPS 成片链接')
      return
    }
    setJobs((prev) => [
      ...prev,
      { id: newJobId(), label: '上一段 AI 成片', mediaUrl: u, phase: 'pending' },
    ])
    setHint('已加入上一段生成结果')
    setErr(null)
  }, [lastResultUrl])

  const removeJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id))

  const patchJob = (id: string, patch: Partial<IceBatchJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }

  const pollJob = async (localJobId: string, iceJobId: string): Promise<boolean> => {
    for (let i = 0; i < POLL_MAX; i++) {
      const st = await fetchIceJobStatus(iceJobId)
      if (!st.ok) {
        patchJob(localJobId, { phase: 'failed', message: st.message })
        return false
      }
      if (st.failed) {
        patchJob(localJobId, {
          phase: 'failed',
          message: st.message ? `剪辑失败：${st.message}` : `剪辑失败：${st.status}`,
        })
        return false
      }
      if (st.done && st.downloadUrl) {
        patchJob(localJobId, {
          phase: 'done',
          downloadUrl: st.downloadUrl,
          message: '剪辑完成，可在右侧下载成片',
        })
        return true
      }
      patchJob(localJobId, {
        phase: 'polling',
        message: `剪辑中 ${st.status}${formatProgress(st.progress)}`,
      })
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    patchJob(localJobId, { phase: 'failed', message: '剪辑超时，请稍后重试或联系运营' })
    return false
  }

  const downloadJob = async (job: IceBatchJob) => {
    if (!job.exportId) return
    try {
      const blobUrl = await downloadIceExportBlob(job.exportId)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${job.label}.mp4`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (job.downloadUrl) window.open(job.downloadUrl, '_blank', 'noopener')
      else setErr(msg)
    }
  }

  const runBatch = async () => {
    if (!cfg?.configured) {
      setErr('墨典AI云剪服务未就绪，请联系运营在管控台配置 AppId 与 AccessKey。')
      return
    }
    if (!briefOk) {
      setErr('请填写剪辑文案指令（至少 4 个字），描述成片风格与要求。')
      return
    }
    const pending = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed')
    if (pending.length === 0) {
      setErr('请先添加至少一条素材到队列')
      return
    }
    setBusy(true)
    setErr(null)
    setHint(`正在提交 ${pending.length} 条任务…`)

    const brief = editBrief.trim()
    for (const job of pending) {
      patchJob(job.id, { phase: 'pipeline', message: '上传素材并提交云端剪辑…' })
      const pipe = await postIcePipeline({
        mediaUrl: job.mediaUrl,
        projectName: `墨典AI云剪-${job.label}`,
        editBrief: brief,
        width: aspect.width,
        height: aspect.height,
        clipEndSec,
        preset,
      })
      if (!pipe.ok) {
        patchJob(job.id, { phase: 'failed', message: pipe.message })
        continue
      }
      patchJob(job.id, {
        exportId: pipe.jobId,
        phase: 'polling',
        message: '云端剪辑中…',
      })
      await pollJob(job.id, pipe.jobId)
    }

    setBusy(false)
    setHint('全部任务已处理完毕，请在右侧「成片输出」下载 MP4。')
  }

  return (
    <div className="space-y-6">
      {/* 顶栏 */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Cloud className="h-5 w-5" />
            </span>
            墨典AI云剪
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            批量包装探店/带货短片：左侧填写<strong className="font-medium text-zinc-800">素材</strong>与
            <strong className="font-medium text-zinc-800">剪辑指令</strong>，提交后在右侧
            <strong className="font-medium text-zinc-800">成片输出</strong>区下载 MP4。
          </p>
        </div>
        <ServiceBadge cfg={cfg} />
      </header>

      {/* 流程指引 */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { n: 1, title: '添加素材', sub: '必填 · 公网 HTTPS 视频地址' },
          { n: 2, title: '填写剪辑指令', sub: '必填 · 描述风格与包装要求' },
          { n: 3, title: '提交并下载', sub: '成片出现在右侧输出区' },
        ].map((s) => (
          <li
            key={s.n}
            className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-900">{s.title}</p>
              <p className="text-xs text-zinc-500">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* 左侧：输入区 */}
        <div className="space-y-6 lg:col-span-3">
          {/* ① 素材 */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <SectionHead
              step={1}
              title="素材来源"
              required
              hint="每行一条公网 HTTPS 链接；也可使用本页上一段 AI 生成的成片"
            />
            <div className="space-y-3 px-5 pb-5">
              <textarea
                value={urlText}
                disabled={busy}
                onChange={(e) => setUrlText(e.target.value)}
                placeholder={'https://your-cdn.com/shop-tour-01.mp4\nhttps://your-cdn.com/shop-tour-02.mp4'}
                className="min-h-[100px] w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-mono text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={addUrlsFromText}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  加入任务队列
                </button>
                {lastResultUrl ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={appendLastResult}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    使用上一段 AI 成片
                  </button>
                ) : null}
              </div>
              {jobs.length > 0 ? (
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Film className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{j.label}</span>
                      <PhasePill phase={j.phase} />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeJob(j.id)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="移除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">队列为空 — 添加素材后才能提交云剪。</p>
              )}
            </div>
          </section>

          {/* ② 剪辑指令 */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <SectionHead
              step={2}
              title="剪辑文案指令"
              required
              hint="告诉云端如何包装：节奏、字幕风格、氛围、需突出的卖点等（会写入剪辑项目描述）"
            />
            <div className="space-y-4 px-5 pb-5">
              <textarea
                value={editBrief}
                disabled={busy}
                onChange={(e) => setEditBrief(e.target.value)}
                placeholder={
                  '示例：竖屏探店短视频，前 3 秒抓眼球，整体轻快；突出「招牌牛肉面」与店内环境；结尾加品牌 Slogan 位；适合抖音发布。'
                }
                className={cn(
                  'min-h-[120px] w-full rounded-lg border px-3 py-2.5 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2',
                  briefOk || !editBrief
                    ? 'border-zinc-300 focus:border-orange-500 focus:ring-orange-500/20'
                    : 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20',
                )}
              />
              {!briefOk && editBrief.length > 0 ? (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  指令过短，请至少输入 4 个字
                </p>
              ) : null}

              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-3">
                <p className="mb-3 text-xs font-medium text-zinc-700">输出参数（选填）</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="画幅">
                    <select
                      value={aspectId}
                      disabled={busy}
                      onChange={(e) => setAspectId(e.target.value as typeof aspectId)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                    >
                      {ICE_ASPECT_PRESETS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="取用时长（秒）">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={clipEndSec}
                      disabled={busy}
                      onChange={(e) => setClipEndSec(Number(e.target.value) || 10)}
                      className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
                    />
                  </Field>
                  <Field label="画面特效">
                    <select
                      value={preset}
                      disabled={busy}
                      onChange={(e) => setPreset(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                    >
                      {presetOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </div>
          </section>

          {/* 提交 */}
          <div className="sticky bottom-4 z-10 rounded-xl border border-orange-200 bg-orange-50/90 p-4 shadow-lg backdrop-blur-sm">
            {(err || hint) && (
              <div
                className={cn(
                  'mb-3 rounded-lg px-3 py-2 text-sm',
                  err ? 'bg-red-100 text-red-900' : 'bg-white/80 text-zinc-700',
                )}
              >
                {err ?? hint}
              </div>
            )}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void runBatch()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  墨典AI云剪进行中…
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  提交墨典AI云剪
                  {pendingCount > 0 ? `（${pendingCount} 条）` : ''}
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              提交后请在右侧「成片输出」查看进度并下载；单条任务约需数分钟。
            </p>
          </div>
        </div>

        {/* 右侧：成片输出 */}
        <aside className="lg:col-span-2">
          <section className="sticky top-4 rounded-xl border-2 border-orange-200 bg-gradient-to-b from-orange-50/80 to-white shadow-sm">
            <div className="border-b border-orange-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <Download className="h-5 w-5 text-orange-600" />
                成片输出
                <span className="text-xs font-normal text-zinc-500">（步骤 3）</span>
              </h3>
              <p className="mt-1 text-xs text-zinc-600">剪辑完成后，在此下载 MP4 或打开云端链接。</p>
            </div>

            <div className="p-5">
              {latestDone ? (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-900">
                    <CheckCircle2 className="h-5 w-5" />
                    最新成片已就绪
                  </div>
                  <p className="mb-3 truncate text-xs text-emerald-800">{latestDone.label}</p>
                  <button
                    type="button"
                    onClick={() => void downloadJob(latestDone)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Download className="h-5 w-5" />
                    下载 MP4
                  </button>
                  {latestDone.downloadUrl ? (
                    <a
                      href={latestDone.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-1 text-xs text-emerald-800 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      在浏览器中打开成片链接
                    </a>
                  ) : null}
                </div>
              ) : busy ? (
                <div className="mb-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-orange-200 bg-white py-10 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                  <p className="mt-3 text-sm font-medium text-zinc-800">云端剪辑中…</p>
                  <p className="mt-1 text-xs text-zinc-500">完成后下载按钮将出现在此区域</p>
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-10 text-center">
                  <Download className="mx-auto h-10 w-10 text-zinc-300" />
                  <p className="mt-3 text-sm text-zinc-600">暂无成片</p>
                  <p className="mt-1 px-6 text-xs text-zinc-500">
                    完成左侧「素材 + 剪辑指令」后点击提交，成片将显示在此处。
                  </p>
                </div>
              )}

              {jobs.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    任务列表
                  </p>
                  <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                    {jobs.map((j) => (
                      <li
                        key={j.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-sm',
                          j.phase === 'done' && 'border-emerald-200 bg-emerald-50/50',
                          j.phase === 'failed' && 'border-red-200 bg-red-50/50',
                          j.phase !== 'done' &&
                            j.phase !== 'failed' &&
                            'border-zinc-200 bg-white',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-zinc-800">{j.label}</span>
                          <PhasePill phase={j.phase} />
                        </div>
                        {j.message ? (
                          <p className="mt-1 text-xs text-zinc-600">{j.message}</p>
                        ) : null}
                        {j.phase === 'done' ? (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void downloadJob(j)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-orange-600 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              下载
                            </button>
                            {j.downloadUrl ? (
                              <a
                                href={j.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-1.5 text-zinc-700 hover:bg-zinc-50"
                                title="打开链接"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          <ConfigFootnote cfg={cfg} />
        </aside>
      </div>
    </div>
  )
}

function ServiceBadge({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  const ready = cfg?.configured && (cfg.hasOssOutput || cfg.hasVodOutput)
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium',
        ready
          ? 'bg-emerald-100 text-emerald-900'
          : cfg?.configured
            ? 'bg-amber-100 text-amber-900'
            : 'bg-red-100 text-red-900',
      )}
    >
      {ready ? '服务就绪' : cfg?.configured ? '待配置输出存储' : '未配置凭据'}
    </span>
  )
}

function SectionHead({
  step,
  title,
  required,
  hint,
}: {
  step: number
  title: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="border-b border-zinc-100 px-5 py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-[11px] font-bold text-white">
          {step}
        </span>
        {title}
        {required ? <RequiredMark /> : null}
      </h3>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  )
}

function RequiredMark() {
  return (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
      必填
    </span>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      <span>{label}</span>
      {children}
    </label>
  )
}

function PhasePill({ phase }: { phase: IceBatchJob['phase'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
        phase === 'done' && 'bg-emerald-100 text-emerald-800',
        phase === 'failed' && 'bg-red-100 text-red-800',
        phase === 'pending' && 'bg-zinc-100 text-zinc-700',
        (phase === 'pipeline' || phase === 'polling') && 'bg-amber-100 text-amber-900',
      )}
    >
      {PHASE_LABEL[phase]}
    </span>
  )
}

function ConfigFootnote({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  if (!cfg) return null
  return (
    <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
      墨典AI云剪由智能媒体服务提供算力；凭据由运营在管控台维护。
      {cfg.regionId ? ` 地域 ${cfg.regionId}。` : ''}
      {!cfg.hasOssOutput && !cfg.hasVodOutput && cfg.configured ? (
        <span className="mt-1 block text-amber-700">
          运营还需配置点播存储或 OSS 输出前缀，否则无法生成成片。
        </span>
      ) : null}
    </p>
  )
}
