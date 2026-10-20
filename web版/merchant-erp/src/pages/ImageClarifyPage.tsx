import { useRef, useState } from 'react'
import { MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE } from '../lib/mpPointsEconomics'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import {
  postImageClarifyJudge,
  postImageClarifyRun,
  type ImageClarifyChoice,
} from '../services/ai/aiClient'
import { useMembership } from '../context/MembershipContext'
import {
  checkVisualStudioImageBatchAffordable,
  spendVisualStudioImagePoints,
} from '../services/mpAiPointsSpendClient'

async function fileToJpegDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const long0 = Math.max(bmp.width, bmp.height)
  const short0 = Math.min(bmp.width, bmp.height)
  let scale = Math.min(1, 2048 / long0)
  if (short0 * scale < 512) scale = 512 / short0
  if (long0 * scale > 4096) scale = 4096 / long0
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取图片')
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: w, height: h }
}

export default function ImageClarifyPage() {
  const { requireAiImageGen } = useMembership()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceData, setSourceData] = useState('')
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 })
  const [resultUrl, setResultUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [choice, setChoice] = useState<ImageClarifyChoice | null>(null)
  const [msg, setMsg] = useState('')
  const [zoomUrl, setZoomUrl] = useState('')

  async function onPick(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) {
      setMsg('请选择图片')
      return
    }
    setMsg('')
    setResultUrl('')
    setChoice(null)
    setStage('')
    const packed = await fileToJpegDataUrl(file)
    setSourceData(packed.dataUrl)
    setSourceUrl(packed.dataUrl)
    setSourceSize({ width: packed.width, height: packed.height })
  }

  async function onClarify() {
    if (!sourceData || busy) return
    if (!requireAiImageGen()) return
    setBusy(true)
    setResultUrl('')
    setChoice(null)
    setMsg('')
    setStage('正在努力处理中')
    try {
      const afford = await checkVisualStudioImageBatchAffordable(1, 'standard')
      if (!afford.ok) {
        setMsg(afford.message || '积分不足')
        return
      }
      const judged = await postImageClarifyJudge(sourceData, sourceSize.width, sourceSize.height)
      if (!judged.ok) {
        setMsg(judged.message || '没能判断适合的方式')
        return
      }
      setChoice(judged.choice)
      setStage('正在努力变清晰，马上就好')
      const out = await postImageClarifyRun(
        sourceData,
        sourceSize.width,
        sourceSize.height,
        judged.choice.route,
      )
      if (!out.ok) {
        setMsg(out.message || '修复失败')
        return
      }
      if (readMpSessionToken() && !(out.pointsCharged && out.pointsCharged > 0)) {
        await spendVisualStudioImagePoints({
          idempotencyKey: `img-clarify-${Date.now()}`,
          note: '图片变清晰',
          tier: 'standard',
        })
      }
      setChoice(out.choice)
      setResultUrl(out.imageUrl)
      const note = out.fallbackNote ? `${out.fallbackNote}。` : ''
      setMsg(`${note}已完成，本次 ${MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '修复失败')
    } finally {
      setBusy(false)
      setStage('')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-slate-900">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">图片变清晰</h1>
        <p className="mt-1 text-sm text-slate-500">
          先看图，再选择万相超分或千问图像编辑。每次 {MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分。
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void onPick(file)
        }}
      />
      <button
        type="button"
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        选择图片
      </button>
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="rounded-xl border border-slate-200 bg-white p-3">
          <figcaption className="mb-2 text-xs text-slate-500">原图</figcaption>
          {sourceUrl ? (
            <img src={sourceUrl} alt="" className="max-h-80 w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">尚未选择</div>
          )}
        </figure>
        <figure className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3">
          <figcaption className="mb-2 text-xs text-slate-500">清晰后</figcaption>
          {resultUrl ? (
            <button type="button" className="block w-full" onClick={() => setZoomUrl(resultUrl)}>
              <img
                src={resultUrl}
                alt="清晰后，点击查看大图"
                referrerPolicy="no-referrer"
                className="max-h-80 w-full rounded-lg object-contain"
              />
              <span className="mt-1 block text-center text-xs text-violet-700">点击查看大图</span>
            </button>
          ) : (
            <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-sm text-slate-400">
              {busy && sourceUrl ? (
                <img src={sourceUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-80" />
              ) : null}
              <span className="relative z-10 px-3 text-center">{busy ? stage || '处理中…' : '等待生成'}</span>
              {busy ? (
                <span className="clarify-scan pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-white/80 to-transparent" />
              ) : null}
            </div>
          )}
        </figure>
      </div>
      {choice && !busy ? (
        <p className="text-sm text-slate-600">
          {choice.label} · {choice.detail}
          {choice.reason ? `。${choice.reason}` : ''}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!sourceData || busy}
        className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void onClarify()}
      >
        {busy ? '处理中…' : '开始变清晰'}
      </button>
      {resultUrl ? (
        <a href={resultUrl} download="clarify.jpg" className="ml-3 text-sm text-violet-700 underline">
          下载结果
        </a>
      ) : null}
      {msg ? <p className="text-sm text-amber-700">{msg}</p> : null}
      {zoomUrl ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomUrl('')}
        >
          <img
            src={zoomUrl}
            alt="清晰后大图"
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain"
          />
        </button>
      ) : null}
      <style>{`
        @keyframes clarify-scan-move {
          0% { transform: translateY(-120%); }
          100% { transform: translateY(320%); }
        }
        .clarify-scan { animation: clarify-scan-move 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
