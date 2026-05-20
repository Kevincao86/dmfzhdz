import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../cn'
import {
  downloadIceExportBlob,
  fetchAliyunIceCloudConfig,
  fetchIceJobStatus,
  ICE_ASPECT_PRESETS,
  postIcePipeline,
  uploadIceLocalVideoFile,
  type IceBatchJob,
  type AliyunIceCloudConfig,
} from '../services/aliyunIceCloudApi'

const POLL_MS = 5000
const POLL_MAX = 120

/** 每条素材批量生成的成片数量 */
export const ICE_BATCH_GENERATE_COUNTS = [10, 20, 50, 100] as const
export type IceBatchGenerateCount = (typeof ICE_BATCH_GENERATE_COUNTS)[number]

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
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [aspectId, setAspectId] = useState<(typeof ICE_ASPECT_PRESETS)[number]['id']>('9:16')
  const [clipEndSec, setClipEndSec] = useState(10)
  const [preset, setPreset] = useState('无附加特效')
  const [batchGenerateEnabled, setBatchGenerateEnabled] = useState(false)
  const [batchGenerateCount, setBatchGenerateCount] = useState<IceBatchGenerateCount>(10)

  const aspect = useMemo(
    () => ICE_ASPECT_PRESETS.find((a) => a.id === aspectId) ?? ICE_ASPECT_PRESETS[0],
    [aspectId],
  )

  const presetOptions = cfg?.effectOptions?.map((o) => o.label) ?? cfg?.presets ?? ['无附加特效', '淡入淡出']

  const pendingCount = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed').length
  const effectiveBatchCount = batchGenerateEnabled ? batchGenerateCount : 1
  const totalBatchRuns = pendingCount * effectiveBatchCount
  const doneJobs = jobs.filter((j) => j.phase === 'done')
  const latestDone = doneJobs.length > 0 ? doneJobs[doneJobs.length - 1] : null
  const briefOk = editBrief.trim().length >= 4
  const canSubmit = cfg?.configured && pendingCount > 0 && briefOk && !busy && !uploading

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

  const openLocalFilePicker = useCallback(() => {
    if (busy || uploading) return
    if (!cfg?.localUploadEnabled) {
      setErr(
        '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 墨典AI云剪」填写 OSS 成片 URL 前缀（格式如 https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/），保存后刷新本页。',
      )
      return
    }
    fileInputRef.current?.click()
  }, [busy, uploading, cfg?.localUploadEnabled])

  const handleLocalFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || uploading || busy) return
      if (!cfg?.localUploadEnabled) {
        setErr(
          '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 墨典AI云剪」填写 OSS 成片 URL 前缀后保存，并刷新本页。',
        )
        return
      }
      setUploading(true)
      setErr(null)
      let added = 0
      for (const file of Array.from(files)) {
        const isVideo =
          file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)
        if (!isVideo) {
          setErr(`「${file.name}」不是支持的视频格式（mp4/mov 等）`)
          continue
        }
        const r = await uploadIceLocalVideoFile(file)
        if (!r.ok) {
          setErr(r.message)
          continue
        }
        setJobs((prev) => [
          ...prev,
          {
            id: newJobId(),
            label: r.label.slice(0, 40),
            mediaUrl: r.mediaUrl,
            phase: 'pending' as const,
          },
        ])
        added += 1
      }
      setUploading(false)
      if (added > 0) {
        setHint(`已上传 ${added} 个文件到 OSS 并加入队列，请填写剪辑指令后提交。`)
      }
    },
    [uploading, busy, cfg?.localUploadEnabled],
  )

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
    setHint(
      batchGenerateEnabled
        ? `正在批量生成 ${totalBatchRuns} 条成片（${pending.length} 个素材 × 每素材 ${batchGenerateCount} 条）…`
        : `正在提交 ${pending.length} 条单条剪辑任务…`,
    )

    const brief = editBrief.trim()
    let runIndex = 0
    for (const job of pending) {
      if (batchGenerateEnabled) {
        for (let copy = 0; copy < batchGenerateCount; copy++) {
          runIndex += 1
          const runLabel = `${job.label} · 第 ${copy + 1}/${batchGenerateCount} 条`
          const localId = newJobId()
          setJobs((prev) => [
            ...prev,
            {
              id: localId,
              label: runLabel,
              mediaUrl: job.mediaUrl,
              phase: 'pipeline',
              message: `批量 ${runIndex}/${totalBatchRuns} · 提交云端剪辑…`,
            },
          ])
          const pipe = await postIcePipeline({
            mediaUrl: job.mediaUrl,
            projectName: `墨典AI云剪-${runLabel}`.slice(0, 120),
            editBrief: brief,
            width: aspect.width,
            height: aspect.height,
            clipEndSec,
            preset,
          })
          if (!pipe.ok) {
            patchJob(localId, { phase: 'failed', message: pipe.message })
            continue
          }
          patchJob(localId, {
            exportId: pipe.jobId,
            phase: 'polling',
            message: `批量 ${runIndex}/${totalBatchRuns} · 云端剪辑中…`,
          })
          await pollJob(localId, pipe.jobId)
        }
        patchJob(job.id, {
          phase: 'done',
          message: `已按批量设置生成 ${batchGenerateCount} 条，见右侧成片列表`,
        })
      } else {
        runIndex += 1
        patchJob(job.id, {
          phase: 'pipeline',
          message:
            pending.length > 1
              ? `单条剪辑 ${runIndex}/${pending.length} · 提交云端…`
              : '提交云端剪辑…',
        })
        const pipe = await postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: `墨典AI云剪-${job.label}`.slice(0, 120),
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
          message:
            pending.length > 1
              ? `单条剪辑 ${runIndex}/${pending.length} · 云端剪辑中…`
              : '云端剪辑中…',
        })
        await pollJob(job.id, pipe.jobId)
      }
    }

    setBusy(false)
    setHint(
      batchGenerateEnabled
        ? `批量任务已处理完毕（共 ${totalBatchRuns} 条），请在右侧「成片输出」下载 MP4。`
        : `剪辑任务已提交完毕（共 ${pending.length} 条），请在右侧「成片输出」下载 MP4。`,
    )
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
          { n: 1, title: '添加素材', sub: '必填 · 本地上传或 HTTPS 链接' },
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
              hint="推荐本地上传（写入您已开通的 OSS）；亦可粘贴公网 HTTPS 链接或使用上一段 AI 成片"
            />
            <div className="space-y-4 px-5 pb-5">
              <input
                id="ice-local-video-input"
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*,.mp4,.mov,.m4v,.webm"
                multiple
                className="sr-only"
                disabled={busy || uploading}
                onChange={(e) => {
                  void handleLocalFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              {!cfg?.localUploadEnabled ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
                  <p className="font-medium">本地上传未开启</p>
                  <p className="mt-1 text-amber-900/90">
                    需在运营管理后台「AI模型 → 短视频 API → 墨典AI云剪」填写 OSS 成片 URL 前缀并保存，然后刷新本页。仍可粘贴下方
                    HTTPS 链接作为素材。
                  </p>
                </div>
              ) : null}
              <label
                htmlFor="ice-local-video-input"
                role="button"
                tabIndex={busy || uploading ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openLocalFilePicker()
                  }
                }}
                onClick={(e) => {
                  if (!cfg?.localUploadEnabled) {
                    e.preventDefault()
                    openLocalFilePicker()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (busy || uploading) return
                  void handleLocalFiles(e.dataTransfer.files)
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition',
                  busy || uploading ? 'pointer-events-none opacity-60' : '',
                  cfg?.localUploadEnabled
                    ? 'border-orange-300 bg-orange-50/50 hover:border-orange-400 hover:bg-orange-50'
                    : 'border-zinc-300 bg-zinc-50 hover:border-amber-400 hover:bg-amber-50/40',
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                    <span className="text-sm font-medium text-zinc-800">正在上传到 OSS…</span>
                  </>
                ) : (
                  <>
                    <Upload
                      className={cn(
                        'h-8 w-8',
                        cfg?.localUploadEnabled ? 'text-orange-600' : 'text-amber-600',
                      )}
                    />
                    <span className="text-sm font-semibold text-zinc-900">本地上传视频</span>
                    <span className="text-center text-xs text-zinc-500">
                      点击或拖拽到此处 · MP4 / MOV 等 · 单文件 ≤ 500MB
                      {!cfg?.localUploadEnabled ? (
                        <span className="mt-1 block text-amber-800">未配置 OSS 时点击可查看说明</span>
                      ) : null}
                    </span>
                  </>
                )}
              </label>

              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" />
                  或使用链接
                </span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>

              <textarea
                value={urlText}
                disabled={busy || uploading}
                onChange={(e) => setUrlText(e.target.value)}
                placeholder={'https://your-cdn.com/shop-tour-01.mp4\nhttps://your-cdn.com/shop-tour-02.mp4'}
                className="min-h-[88px] w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-mono text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || uploading}
                  onClick={addUrlsFromText}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  加入任务队列
                </button>
                {lastResultUrl ? (
                  <button
                    type="button"
                    disabled={busy || uploading}
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

          {/* 批量生成（可选） */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-5 py-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={batchGenerateEnabled}
                  disabled={busy || uploading}
                  onChange={(e) => setBatchGenerateEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  <span className="text-sm font-semibold text-zinc-900">启用批量生成</span>
                  <p className="mt-1 text-xs font-normal text-zinc-500">
                    未勾选时每个素材仅生成 1 条成片；勾选后按所选条数依次提交（耗时与条数成正比）。
                  </p>
                </span>
              </label>
            </div>
            <div
              className={cn(
                'flex flex-wrap gap-2 px-5 py-4 transition-opacity',
                !batchGenerateEnabled && 'pointer-events-none opacity-40',
              )}
            >
              {ICE_BATCH_GENERATE_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy || uploading || !batchGenerateEnabled}
                  onClick={() => setBatchGenerateCount(n)}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition',
                    batchGenerateCount === n
                      ? 'border-orange-500 bg-orange-600 text-white shadow-sm'
                      : 'border-zinc-300 bg-white text-zinc-800 hover:border-orange-300 hover:bg-orange-50',
                    (busy || uploading) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {n} 条
                </button>
              ))}
            </div>
            {pendingCount > 0 ? (
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-600">
                {batchGenerateEnabled ? (
                  <>
                    当前队列 {pendingCount} 个素材 × {batchGenerateCount} 条 ≈ 共提交{' '}
                    <strong className="text-zinc-900">{totalBatchRuns}</strong> 次云剪任务
                  </>
                ) : (
                  <>
                    当前队列 {pendingCount} 个素材，单条剪辑 ≈ 共提交{' '}
                    <strong className="text-zinc-900">{totalBatchRuns}</strong> 次云剪任务
                  </>
                )}
              </p>
            ) : null}
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
                  {pendingCount > 0
                    ? batchGenerateEnabled
                      ? `（约 ${totalBatchRuns} 条成片）`
                      : `（${pendingCount} 条单条剪辑）`
                    : ''}
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
    <div className="flex flex-col items-end gap-1">
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
      {cfg?.localUploadEnabled ? (
        <span className="text-[11px] text-emerald-700">本地上传已开启</span>
      ) : cfg?.configured ? (
        <span className="text-[11px] text-zinc-500">本地上传需 OSS 前缀</span>
      ) : null}
    </div>
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
      {cfg.localUploadEnabled ? (
        <span className="mt-1 block text-zinc-600">
          本地上传写入 OSS 的 source/ 目录，云剪完成后在右侧下载成片。
        </span>
      ) : null}
      {!cfg.hasOssOutput && !cfg.hasVodOutput && cfg.configured ? (
        <span className="mt-1 block text-amber-700">
          运营还需配置点播存储或 OSS 输出前缀，否则无法生成成片。
        </span>
      ) : null}
    </p>
  )
}
