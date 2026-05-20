import { Cloud, Download, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
    setHint(`已加入 ${urls.length} 条素材`)
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
          message: '剪辑完成',
        })
        return true
      }
      patchJob(localJobId, {
        phase: 'polling',
        message: `剪辑中… ${st.status}${formatProgress(st.progress)}`,
      })
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    patchJob(localJobId, { phase: 'failed', message: '剪辑超时，请稍后在阿里云 ICE 控制台查看' })
    return false
  }

  const runBatch = async () => {
    if (!cfg?.configured) {
      setErr('未配置阿里云 ICE，请在运营管控台「AI模型 → 短视频 API」填写 AppId 与 AccessKey。')
      return
    }
    const pending = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed')
    if (pending.length === 0) {
      setErr('队列为空或已全部完成')
      return
    }
    setBusy(true)
    setErr(null)
    setHint(`批量云剪：共 ${pending.length} 条，按序提交阿里云 ICE…`)

    for (const job of pending) {
      patchJob(job.id, { phase: 'pipeline', message: 'URL 拉取上传并提交剪辑合成…' })
      const pipe = await postIcePipeline({
        mediaUrl: job.mediaUrl,
        projectName: `墨典云剪-${job.label}`,
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
        message: '等待云端剪辑…',
      })
      await pollJob(job.id, pipe.jobId)
    }

    setBusy(false)
    setHint('批量任务已跑完，请查看各条状态并下载成片。')
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

  return (
    <section className="space-y-8 rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/50 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Cloud className="h-5 w-5 text-cyan-600" />
            AI 批量云剪（阿里云 ICE）
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            智能媒体服务云剪辑：URL 拉取上传、Timeline 合成，适合探店成片批量包装。
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium',
            cfg?.configured ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900',
          )}
        >
          {cfg?.configured ? '已配置 ICE' : '未配置凭据'}
        </span>
      </div>

      <IceDocHint cfg={cfg} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          <span>画幅</span>
          <select
            value={aspectId}
            disabled={busy}
            onChange={(e) => setAspectId(e.target.value as typeof aspectId)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
          >
            {ICE_ASPECT_PRESETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          <span>片段时长（秒）</span>
          <input
            type="number"
            min={1}
            max={120}
            value={clipEndSec}
            disabled={busy}
            onChange={(e) => setClipEndSec(Number(e.target.value) || 10)}
            className="rounded-lg border border-zinc-300 px-2 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          <span>剪辑特效</span>
          <select
            value={preset}
            disabled={busy}
            onChange={(e) => setPreset(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
          >
            {presetOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-800">批量素材 URL（每行一条）</span>
        <textarea
          value={urlText}
          disabled={busy}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder={'https://example.com/video1.mp4\nhttps://example.com/video2.mp4'}
          className="min-h-[88px] w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={addUrlsFromText}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-100"
          >
            <Plus className="h-4 w-4" /> 加入队列
          </button>
          {lastResultUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={appendLastResult}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              使用上一段 AI 成片
            </button>
          ) : null}
        </div>
      </label>

      {jobs.length > 0 ? (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-zinc-800">{j.label}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  j.phase === 'done' && 'bg-emerald-100 text-emerald-900',
                  j.phase === 'failed' && 'bg-red-100 text-red-900',
                  (j.phase === 'pending' || j.phase === 'pipeline' || j.phase === 'polling') &&
                    'bg-amber-100 text-amber-900',
                )}
              >
                {j.phase}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{j.mediaUrl}</span>
              {j.message ? <span className="text-xs text-zinc-600">{j.message}</span> : null}
              {j.phase === 'done' ? (
                <button
                  type="button"
                  onClick={() => void downloadJob(j)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-800 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> 下载
                </button>
              ) : null}
              {j.downloadUrl && j.phase === 'done' ? (
                <a
                  href={j.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-700 hover:text-cyan-900"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => removeJob(j.id)}
                className="text-zinc-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {(hint || err) && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            err ? 'border border-red-200 bg-red-50 text-red-900' : 'border border-cyan-200 bg-cyan-50 text-cyan-950',
          )}
        >
          {err ?? hint}
        </div>
      )}

      <button
        type="button"
        disabled={busy || !cfg?.configured || jobs.length === 0}
        onClick={() => void runBatch()}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
        {busy ? '批量云剪进行中…' : '开始 AI 批量云剪'}
      </button>
    </section>
  )
}

function IceDocHint({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  return (
    <div className="rounded-lg border border-cyan-100 bg-white px-4 py-3 text-xs leading-relaxed text-slate-600">
      基于{' '}
      <a
        href={
          cfg?.docsUrl ??
          'https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-overview'
        }
        target="_blank"
        rel="noreferrer"
        className="font-medium text-cyan-800 underline"
      >
        阿里云智能媒体服务 ICE
      </a>
      ：对每条公网音视频执行「URL 上传 → 剪辑合成（SubmitMediaProducingJob）」。
      {cfg?.regionId ? ` 当前地域：${cfg.regionId}。` : ''}
      {!cfg?.hasOssOutput && !cfg?.hasVodOutput && cfg?.configured ? (
        <span className="mt-1 block text-amber-800">
          提示：还需在运营台配置「点播存储地址」或「OSS 输出 URL 前缀」才能生成成片。
        </span>
      ) : null}
    </div>
  )
}
