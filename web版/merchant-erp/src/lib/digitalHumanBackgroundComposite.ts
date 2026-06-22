/** 口型驱动前：将人像合成到所选背景（门店实景 / 纯色 / 绿幕等） */

const OUT_W = 1080
const OUT_H = 1920

function pureBase64ToBlob(b64: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes])
}

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(pureBase64ToBlob(b64))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('无法解码人像图片'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
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

function drawFoodRestaurant(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#3d2314')
  g.addColorStop(0.35, '#5c3a24')
  g.addColorStop(1, '#2a1810')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,200,120,0.25)'
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.arc(w * (0.15 + i * 0.14), h * 0.12, w * 0.04, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,240,210,0.12)'
  ctx.fillRect(w * 0.05, h * 0.55, w * 0.9, h * 0.35)
}

function drawFastFoodCounter(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#ff6b35')
  g.addColorStop(0.5, '#f7931e')
  g.addColorStop(1, '#c0392b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(w * 0.06, h * 0.08, w * 0.88, h * 0.18)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(w * 0.08, h * 0.32, w * 0.84, h * 0.08)
}

function drawDeliveryWindow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#87ceeb')
  g.addColorStop(0.4, '#b0d4f1')
  g.addColorStop(1, '#e8eef5')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(60,60,80,0.15)'
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(w * (0.05 + i * 0.12), h * 0.05, w * 0.06, h * 0.45)
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(w * 0.1, h * 0.58, w * 0.8, h * 0.28)
}

function drawMallBright(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#f5f7fa'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillRect(w * (0.08 + col * 0.3), h * (0.06 + row * 0.12), w * 0.22, h * 0.08)
    }
  }
  const lg = ctx.createRadialGradient(w * 0.5, h * 0.2, 0, w * 0.5, h * 0.2, w * 0.6)
  lg.addColorStop(0, 'rgba(255,255,255,0.8)')
  lg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = lg
  ctx.fillRect(0, 0, w, h * 0.5)
}

function drawKitchenSteam(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#4a3728')
  g.addColorStop(0.5, '#6b5344')
  g.addColorStop(1, '#2c2118')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    ctx.ellipse(w * (0.2 + i * 0.15), h * 0.25, w * 0.06, h * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,180,80,0.2)'
  ctx.fillRect(0, h * 0.5, w, h * 0.5)
}

function drawKtvLounge(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#120818'
  ctx.fillRect(0, 0, w, h)
  const colors = ['#ff0080', '#7928ca', '#0070f3', '#ff4d4d']
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = colors[i % colors.length]!
    ctx.globalAlpha = 0.35 + (i % 3) * 0.1
    ctx.fillRect(w * (0.04 + (i % 3) * 0.32), h * (0.05 + Math.floor(i / 3) * 0.08), w * 0.28, h * 0.05)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(w * 0.08, h * 0.55, w * 0.84, h * 0.35)
}

function drawCinemaHall(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#1a1420')
  g.addColorStop(0.5, '#2a2030')
  g.addColorStop(1, '#0d0a10')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c41e3a' : '#1e3a8a'
    ctx.globalAlpha = 0.65
    ctx.fillRect(w * (0.06 + i * 0.22), h * 0.08, w * 0.18, h * 0.22)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,220,180,0.15)'
  ctx.fillRect(0, h * 0.65, w, h * 0.35)
}

function drawSpaRelax(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#e8ddd0')
  g.addColorStop(0.5, '#d4c4b0')
  g.addColorStop(1, '#b8a898')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.15)
  const lg = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, w * 0.5)
  lg.addColorStop(0, 'rgba(255,248,240,0.5)')
  lg.addColorStop(1, 'rgba(255,248,240,0)')
  ctx.fillStyle = lg
  ctx.fillRect(0, 0, w, h * 0.6)
}

function drawBarWine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#1c1410'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#3d2818'
  ctx.fillRect(w * 0.05, h * 0.06, w * 0.35, h * 0.55)
  ctx.fillStyle = 'rgba(255,180,80,0.35)'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(w * (0.45 + i * 0.1), h * (0.12 + (i % 2) * 0.06), w * 0.04, h * 0.18)
  }
  ctx.fillStyle = 'rgba(200,160,100,0.2)'
  ctx.fillRect(0, h * 0.7, w, h * 0.3)
}

function drawArcadeFun(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0a0618'
  ctx.fillRect(0, 0, w, h)
  const cols = ['#00f5ff', '#ff00aa', '#ffe600', '#00ff88']
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = cols[(row + col) % cols.length]!
      ctx.globalAlpha = 0.4
      ctx.fillRect(w * (0.08 + col * 0.3), h * (0.05 + row * 0.1), w * 0.22, h * 0.07)
    }
  }
  ctx.globalAlpha = 1
}

function drawScenicResort(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55)
  sky.addColorStop(0, '#87b8e8')
  sky.addColorStop(1, '#c5dce8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h * 0.55)
  ctx.fillStyle = '#4a7c59'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.55)
  ctx.lineTo(w * 0.25, h * 0.32)
  ctx.lineTo(w * 0.5, h * 0.48)
  ctx.lineTo(w * 0.75, h * 0.28)
  ctx.lineTo(w, h * 0.52)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(w * 0.15, h * 0.62, w * 0.7, h * 0.25)
}

function drawHomestayCozy(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#a8c8a0')
  g.addColorStop(0.45, '#d4c4a8')
  g.addColorStop(1, '#8b7355')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#f5ebe0'
  ctx.fillRect(w * 0.12, h * 0.35, w * 0.76, h * 0.4)
  ctx.fillStyle = '#6b5344'
  ctx.fillRect(w * 0.35, h * 0.5, w * 0.12, h * 0.25)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(w * 0.18, h * 0.42, w * 0.15, h * 0.12)
}

function drawHotspringMist(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#6b8fa3')
  g.addColorStop(0.4, '#8bafc0')
  g.addColorStop(1, '#4a6b5a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.ellipse(w * (0.1 + i * 0.11), h * (0.2 + (i % 3) * 0.08), w * 0.08, h * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(100,160,180,0.45)'
  ctx.fillRect(w * 0.05, h * 0.58, w * 0.9, h * 0.28)
}

function drawNeonStreet(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#0f0a18'
  ctx.fillRect(0, 0, w, h)
  const colors = ['#ff006e', '#8338ec', '#3a86ff', '#ffbe0b']
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = colors[i]!
    ctx.globalAlpha = 0.55
    ctx.fillRect(w * (0.05 + i * 0.22), h * 0.06, w * 0.18, h * 0.06)
  }
  ctx.globalAlpha = 1
  const g = ctx.createLinearGradient(0, h * 0.6, 0, h)
  g.addColorStop(0, 'rgba(255,0,110,0.1)')
  g.addColorStop(1, 'rgba(131,56,236,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(0, h * 0.5, w, h * 0.5)
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
    case 'food-restaurant':
      drawFoodRestaurant(ctx, w, h)
      return
    case 'fast-food-counter':
      drawFastFoodCounter(ctx, w, h)
      return
    case 'delivery-window':
      drawDeliveryWindow(ctx, w, h)
      return
    case 'mall-bright':
      drawMallBright(ctx, w, h)
      return
    case 'kitchen-steam':
      drawKitchenSteam(ctx, w, h)
      return
    case 'neon-street':
      drawNeonStreet(ctx, w, h)
      return
    case 'ktv-lounge':
      drawKtvLounge(ctx, w, h)
      return
    case 'cinema-hall':
      drawCinemaHall(ctx, w, h)
      return
    case 'spa-relax':
      drawSpaRelax(ctx, w, h)
      return
    case 'bar-wine':
      drawBarWine(ctx, w, h)
      return
    case 'arcade-fun':
      drawArcadeFun(ctx, w, h)
      return
    case 'scenic-resort':
      drawScenicResort(ctx, w, h)
      return
    case 'homestay-cozy':
      drawHomestayCozy(ctx, w, h)
      return
    case 'hotspring-mist':
      drawHotspringMist(ctx, w, h)
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

/** 非默认演播室灰底时，将裁切后人像叠到场景背景上再送口型驱动 */
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

  if (bg === 'custom' && customBackgroundDataUrl?.trim()) {
    const bgImg = await loadImageFromDataUrl(customBackgroundDataUrl.trim())
    drawCustomBackgroundImage(ctx, bgImg, OUT_W, OUT_H)
  } else {
    drawBackground(ctx, OUT_W, OUT_H, bg)
  }

  const img = await loadImageFromPureBase64(portraitPureB64)
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
