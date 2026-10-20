import { useRef, useState } from 'react'
import { MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE } from '../lib/mpPointsEconomics'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { postAiAgentNativeImage } from '../services/ai/aiClient'
import { useMembership } from '../context/MembershipContext'
import {
  checkVisualStudioImageBatchAffordable,
  spendVisualStudioImagePoints,
} from '../services/mpAiPointsSpendClient'

const CLARIFY_PROMPT =
  '这是同一张照片的高清修复。保持画面里的人物、物体、文字、构图和颜色不变，只提高清晰度、锐度和细节，去掉模糊和压缩噪点。不要换脸，不要重画，不要加字，不要改背景。'

async function fileToJpegDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const max = 1280
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取图片')
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function ImageClarifyPage() {
  const { requireAiImageGen } = useMembership()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceData, setSourceData] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function onPick(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) {
      setMsg('请选择图片')
      return
    }
    setMsg('')
    setResultUrl('')
    const dataUrl = await fileToJpegDataUrl(file)
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl)
    setSourceData(dataUrl)
    setSourceUrl(dataUrl)
  }

  async function onClarify() {
    if (!sourceData || busy) return
    if (!requireAiImageGen()) return
    setBusy(true)
    setMsg('校验积分…')
    setResultUrl('')
    try {
      const afford = await checkVisualStudioImageBatchAffordable(1, 'standard')
      if (!afford.ok) {
        setMsg(afford.message || '积分不足')
        return
      }
      setMsg('正在按原图提高清晰度…')
      const out = await postAiAgentNativeImage(CLARIFY_PROMPT, {
        exactPrompt: true,
        preferredVendor: 'qwen',
        referenceImageDataUrl: sourceData,
        preferWanxPosterModel: false,
      })
      if (!out.ok) {
        setMsg(out.message || '修复失败')
        return
      }
      if (readMpSessionToken()) {
        await spendVisualStudioImagePoints({
          idempotencyKey: `img-clarify-${Date.now()}`,
          note: '图片变清晰',
          tier: 'standard',
        })
      }
      setResultUrl(out.imageUrl)
      setMsg(`已完成，本次 ${MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '修复失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-slate-900">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">图片变清晰</h1>
        <p className="mt-1 text-sm text-slate-500">
          上传模糊照片，按原图提高清晰度。与视觉工坊常规生图同一条接口，
          {MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分/张。
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
        <figure className="rounded-xl border border-slate-200 bg-white p-3">
          <figcaption className="mb-2 text-xs text-slate-500">清晰后</figcaption>
          {resultUrl ? (
            <img src={resultUrl} alt="" referrerPolicy="no-referrer" className="max-h-80 w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              {busy ? '处理中…' : '等待生成'}
            </div>
          )}
        </figure>
      </div>
      <button
        type="button"
        disabled={!sourceData || busy}
        className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => void onClarify()}
      >
        {busy ? '处理中…' : '开始变清晰'}
      </button>
      {resultUrl ? (
        <a
          href={resultUrl}
          download="clarify.jpg"
          className="ml-3 text-sm text-violet-700 underline"
        >
          下载结果
        </a>
      ) : null}
      {msg ? <p className="text-sm text-amber-700">{msg}</p> : null}
    </div>
  )
}
