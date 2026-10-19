/** 口型驱动前：将人像合成到所选背景（门店实景 / 纯色 / 绿幕等） */
import { mattePortraitWithFallback } from './digitalHumanPortraitMatting'

const OUT_W = 1080
const OUT_H = 1920

function pureBase64ToBlob(b64: string, mime = 'image/jpeg'): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  let lastErr: Error | null = null
  for (const mime of ['image/png', 'image/jpeg', 'image/webp'] as const) {
    const url = URL.createObjectURL(pureBase64ToBlob(b64, mime))
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('无法解码人像图片'))
        img.src = url
      })
      return img
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  throw lastErr ?? new Error('无法解码人像图片')
}

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('无法导出画面'))
      },
      'image/jpeg',
      q,
    )
  })
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = typeof fr.result === 'string' ? fr.result : ''
      const ix = s.indexOf('base64,')
      resolve(ix >= 0 ? s.slice(ix + 'base64,'.length) : s.replace(/\s/g, ''))
    }
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
}

function drawStoreInterior(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#f5efe6')
  g.addColorStop(0.45, '#ebe3d6')
  g.addColorStop(1, '#d9cfc0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.22)

  ctx.fillStyle = '#c4a882'
  for (let i = 0; i < 4; i++) {
    const y = h * (0.34 + i * 0.11)
    ctx.fillRect(w * 0.06, y, w * 0.88, h * 0.07)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    for (let j = 0; j < 5; j++) {
      ctx.fillRect(w * (0.1 + j * 0.16), y + h * 0.012, w * 0.1, h * 0.045)
    }
    ctx.fillStyle = '#c4a882'
  }

  const lg = ctx.createRadialGradient(w * 0.72, h * 0.18, 0, w * 0.72, h * 0.18, w * 0.35)
  lg.addColorStop(0, 'rgba(255,248,220,0.55)')
  lg.addColorStop(1, 'rgba(255,248,220,0)')
  ctx.fillStyle = lg
  ctx.fillRect(0, 0, w, h * 0.5)
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('无法解码背景图片'))
    img.src = dataUrl
  })
  return img
}

function drawCustomBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = img.width * scale
  const sh = img.height * scale
  const sx = (w - sw) / 2
  const sy = (h - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh)
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, backgroundId: string) {
  switch (backgroundId) {
    case 'store':
      drawStoreInterior(ctx, w, h)
      return
    case 'green':
      ctx.fillStyle = '#00b140'
      ctx.fillRect(0, 0, w, h)
      return
    case 'solid-blue':
      ctx.fillStyle = '#1e4fd6'
      ctx.fillRect(0, 0, w, h)
      return
    case 'studio':
    default: {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#f0f0f2')
      g.addColorStop(0.55, '#e6e6ea')
      g.addColorStop(1, '#d8d8de')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      const spot = ctx.createRadialGradient(w * 0.5, h * 0.28, 0, w * 0.5, h * 0.28, w * 0.55)
      spot.addColorStop(0, 'rgba(255,255,255,0.45)')
      spot.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = spot
      ctx.fillRect(0, 0, w, h)
    }
  }
}

/**
 * 将人像叠入场景：门店/自定义背景先去灰底再合成，供 OmniHuman 单图驱动（避免灰底矩形贴片）。
 */
export async function compositePortraitWithBackground(
  portraitPureB64: string,
  backgroundId: string,
  frameMode: 'half' | 'full' = 'half',
  customBackgroundDataUrl?: string | null,
): Promise<string> {
  const bg = String(backgroundId || 'studio').trim() || 'studio'
  if (bg === 'custom' && !customBackgroundDataUrl?.trim()) return portraitPureB64

  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持画布导出')

  const hasCustomBgImage =
    (bg === 'custom' || bg === 'store') && Boolean(customBackgroundDataUrl?.trim())
  if (hasCustomBgImage) {
    const bgImg = await loadImageFromDataUrl(customBackgroundDataUrl!.trim())
    drawCustomBackgroundImage(ctx, bgImg, OUT_W, OUT_H)
  } else {
    drawBackground(ctx, OUT_W, OUT_H, bg)
  }

  const needsMatte = hasCustomBgImage || bg === 'store' || bg === 'custom' || bg === 'green'
  const portraitSrc = needsMatte
    ? await mattePortraitWithFallback(portraitPureB64, { chromaGreen: bg === 'green' })
    : portraitPureB64
  const img = await loadImageFromPureBase64(portraitSrc)
  const portraitMaxH = frameMode === 'full' ? OUT_H * 0.9 : OUT_H * 0.74
  const scale = Math.min(OUT_W * 0.92 / img.width, portraitMaxH / img.height)
  const pw = img.width * scale
  const ph = img.height * scale
  const px = (OUT_W - pw) / 2
  const py = frameMode === 'full' ? OUT_H - ph - OUT_H * 0.02 : OUT_H - ph - OUT_H * 0.04

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, px, py, pw, ph)

  return blobToPureBase64(await canvasToBlobJpeg(canvas, 0.93))
}

function fusionPrompt(actionText?: string): string {
  const action = String(actionText ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
  return [
    '图生图：参考图是左右对照，不是成片构图。',
    '左半边人物必须原样保留：同一张脸、同一发型发色、同一套衣服和体态，禁止换脸。',
    '右半边是用户上传的真实环境照：空间、灯光、地面、墙面必须用这张照片，禁止另造场景。',
    '输出一张竖屏 9:16 照片：该人物真实站在这个空间里，脚踩地面，有透视和景深。',
    '环境灯光必须打到皮肤、头发和衣服上，人物与地面、墙面、柜台连成一张照片，禁止抠图贴上去。',
    action
      ? `这一镜人物正在做：${action}。动作里点名的食物、饮品或物品必须真实出现，拿在手里或送到嘴边，和手有接触阴影。`
      : '人物自然面对镜头，双手放松。',
    '禁止左右分屏、禁止拼贴、禁止抠图白边、禁止身体镂空破洞、禁止半透明、禁止贴纸悬浮、禁止文字水印。',
  ].join('')
}

async function sideBySideBriefing(portraitPureB64: string, sceneDataUrl: string): Promise<string> {
  const [person, scene] = await Promise.all([
    loadImageFromPureBase64(portraitPureB64),
    loadImageFromDataUrl(sceneDataUrl),
  ])
  const W = 1400
  const H = 788
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持画布导出')
  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, W, H)
  const mid = W / 2
  const pScale = Math.min(mid / Math.max(1, person.width), H / Math.max(1, person.height))
  const pw = person.width * pScale
  const ph = person.height * pScale
  ctx.drawImage(person, (mid - pw) / 2, (H - ph) / 2, pw, ph)
  const sScale = Math.max(mid / Math.max(1, scene.width), H / Math.max(1, scene.height))
  const sw = scene.width * sScale
  const sh = scene.height * sScale
  ctx.drawImage(scene, mid + (mid - sw) / 2, (H - sh) / 2, sw, sh)
  const b64 = await blobToPureBase64(await canvasToBlobJpeg(canvas, 0.84))
  return `data:image/jpeg;base64,${b64}`
}

async function imageResultToPureBase64(imageUrl: string): Promise<string> {
  const raw = imageUrl.trim()
  if (raw.startsWith('data:image/')) {
    const ix = raw.indexOf('base64,')
    if (ix >= 0) return raw.slice(ix + 'base64,'.length).replace(/\s/g, '')
  }
  const res = await fetch(raw)
  if (!res.ok) throw new Error('融合图拉取失败')
  return blobToPureBase64(await res.blob())
}

/**
 * 用生图把人物融进上传的环境照，得到可直接交给口型驱动的竖屏首帧。
 * 失败则抛错，不回退成贴图。
 */
export async function fusePortraitDeepIntoScene(opts: {
  portraitPureB64: string
  sceneDataUrl: string
  /** 这一镜要做的动作。点名的食物或物品必须画进画面。 */
  actionText?: string
}): Promise<string> {
  const { postAiAgentNativeImage } = await import('../services/ai/aiClient')
  const { compressPortraitDataUrlForLibrary } = await import('./digitalHumanCustomMedia')
  const briefing = await sideBySideBriefing(opts.portraitPureB64, opts.sceneDataUrl)
  const ref = await compressPortraitDataUrlForLibrary(briefing)
  const prompt = fusionPrompt(opts.actionText)
  const attempts: Array<{ label: string; run: () => ReturnType<typeof postAiAgentNativeImage> }> = [
    {
      label: '通义万相',
      run: () =>
        postAiAgentNativeImage(prompt, {
          exactPrompt: true,
          aspectRatio: '9:16',
          wanxSize: '864x1536',
          referenceImageDataUrl: ref,
          preferredVendor: 'qwen',
          preferredModelId: 'wan2.7-image-pro',
        }),
    },
    {
      label: '豆包',
      run: () =>
        postAiAgentNativeImage(prompt, {
          exactPrompt: true,
          aspectRatio: '9:16',
          doubaoSize: '2K',
          referenceImageDataUrl: ref,
          preferredVendor: 'doubao',
        }),
    },
  ]
  let lastErr = ''
  for (const attempt of attempts) {
    try {
      const once = await attempt.run()
      if (!once.ok) {
        lastErr = once.message
        continue
      }
      const pure = await imageResultToPureBase64(once.imageUrl)
      if (pure.length > 32) return pure
      lastErr = '融合图无效'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || '人物未能融入环境照')
}
