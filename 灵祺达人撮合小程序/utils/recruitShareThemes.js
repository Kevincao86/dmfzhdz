/** 分享海报 / 小程序码 / 网页二维码共用的节日主题。画在画布上，不依赖外链大图。 */

const THEMES = [
  { id: 'newyear', label: '元旦', bg: ['#FFF8EA', '#F6E2A8'], accent: '#C9A227', ink: '#7A5412', paper: '#FFFBF2', motif: 'firework' },
  { id: 'spring', label: '春节', bg: ['#E11D2E', '#9F1239'], accent: '#F6C453', ink: '#FFF4D4', paper: '#FFF7E8', motif: 'lantern' },
  { id: 'lantern', label: '元宵', bg: ['#FF8A3D', '#F4B183'], accent: '#FFF3D6', ink: '#7C2D12', paper: '#FFF8EF', motif: 'tangyuan' },
  { id: 'valentine', label: '情人节', bg: ['#F472B6', '#FBCFE8'], accent: '#BE185D', ink: '#831843', paper: '#FFF1F6', motif: 'heart' },
  { id: 'women', label: '妇女节', bg: ['#F9A8D4', '#FDE68A'], accent: '#DB2777', ink: '#9D174D', paper: '#FFF5F8', motif: 'flower' },
  { id: 'qingming', label: '清明', bg: ['#D1FAE5', '#A7C4B5'], accent: '#0F766E', ink: '#134E4A', paper: '#F3FBF7', motif: 'willow' },
  { id: 'labor', label: '劳动节', bg: ['#5EEAD4', '#0F766E'], accent: '#134E4A', ink: '#042F2E', paper: '#F0FDFA', motif: 'city' },
  { id: 'youth', label: '青年节', bg: ['#38BDF8', '#1D4ED8'], accent: '#E0F2FE', ink: '#082F49', paper: '#F0F9FF', motif: 'run' },
  { id: 'mother', label: '母亲节', bg: ['#F9A8D4', '#FB7185'], accent: '#9F1239', ink: '#881337', paper: '#FFF1F2', motif: 'flower' },
  { id: 'child', label: '儿童节', bg: ['#67E8F9', '#FDE047'], accent: '#0284C7', ink: '#0C4A6E', paper: '#F0FDFF', motif: 'balloon' },
  { id: 'duanwu', label: '端午', bg: ['#4ADE80', '#166534'], accent: '#FDE68A', ink: '#14532D', paper: '#F0FDF4', motif: 'zongzi' },
  { id: 'father', label: '父亲节', bg: ['#1E3A5F', '#0F172A'], accent: '#F6C453', ink: '#E2E8F0', paper: '#F8FAFC', motif: 'tie' },
  { id: 'qixi', label: '七夕', bg: ['#4C1D95', '#7C3AED'], accent: '#F9A8D4', ink: '#FAE8FF', paper: '#FAF5FF', motif: 'magpie' },
  { id: 'teacher', label: '教师节', bg: ['#F6D7A8', '#C2410C'], accent: '#7C2D12', ink: '#7C2D12', paper: '#FFF7ED', motif: 'book' },
  { id: 'midautumn', label: '中秋', bg: ['#1E1B4B', '#312E81'], accent: '#FDE68A', ink: '#FEF3C7', paper: '#FFFBEB', motif: 'moon' },
  { id: 'national', label: '国庆', bg: ['#DC2626', '#991B1B'], accent: '#FDE68A', ink: '#FEF3C7', paper: '#FFF7ED', motif: 'flag' },
  { id: 'chongyang', label: '重阳', bg: ['#F59E0B', '#B45309'], accent: '#7C2D12', ink: '#78350F', paper: '#FFFBEB', motif: 'flower' },
  { id: 'halloween', label: '万圣节', bg: ['#F97316', '#1F2937'], accent: '#111827', ink: '#FFEDD5', paper: '#FFF7ED', motif: 'pumpkin' },
  { id: 'sale', label: '双十一', bg: ['#EF4444', '#F97316'], accent: '#FFF7ED', ink: '#7F1D1D', paper: '#FFF7ED', motif: 'tag' },
  { id: 'dongzhi', label: '冬至', bg: ['#BFDBFE', '#1D4ED8'], accent: '#1E3A8A', ink: '#1E3A8A', paper: '#EFF6FF', motif: 'dumpling' },
  { id: 'christmas', label: '圣诞', bg: ['#166534', '#B91C1C'], accent: '#FDE68A', ink: '#FEF3C7', paper: '#F0FDF4', motif: 'tree' },
  { id: 'countdown', label: '跨年', bg: ['#0F172A', '#7C3AED'], accent: '#FDE68A', ink: '#FEF3C7', paper: '#F8FAFC', motif: 'firework' },
]

function findTheme(id) {
  const key = String(id || '').trim()
  return THEMES.find((t) => t.id === key) || null
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r || 0, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fillGradient(ctx, theme, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, theme.bg[0])
  g.addColorStop(1, theme.bg[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function motif(ctx, kind, x, y, s, accent) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = accent
  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(2, s * 0.06)
  if (kind === 'lantern') {
    ctx.beginPath()
    ctx.ellipse(s / 2, s * 0.55, s * 0.28, s * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(s * 0.38, s * 0.08, s * 0.24, s * 0.1)
  } else if (kind === 'heart') {
    ctx.beginPath()
    ctx.moveTo(s / 2, s * 0.82)
    ctx.bezierCurveTo(-s * 0.1, s * 0.45, s * 0.15, s * 0.05, s / 2, s * 0.32)
    ctx.bezierCurveTo(s * 0.85, s * 0.05, s * 1.1, s * 0.45, s / 2, s * 0.82)
    ctx.fill()
  } else if (kind === 'moon') {
    ctx.beginPath()
    ctx.arc(s * 0.42, s * 0.5, s * 0.32, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(s * 0.62, s * 0.4, s * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  } else if (kind === 'firework') {
    const cx = s / 2
    const cy = s / 2
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * s * 0.46, cy + Math.sin(a) * s * 0.46)
      ctx.stroke()
    }
  } else if (kind === 'tree') {
    ctx.beginPath()
    ctx.moveTo(s / 2, s * 0.08)
    ctx.lineTo(s * 0.82, s * 0.72)
    ctx.lineTo(s * 0.18, s * 0.72)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(s * 0.42, s * 0.72, s * 0.16, s * 0.18)
  } else if (kind === 'pumpkin') {
    ctx.beginPath()
    ctx.ellipse(s / 2, s * 0.58, s * 0.32, s * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(s * 0.46, s * 0.18, s * 0.08, s * 0.16)
  } else {
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintScene(ctx, theme, w, h) {
  fillGradient(ctx, theme, w, h)
  ctx.save()
  ctx.globalAlpha = 0.9
  motif(ctx, theme.motif, 18, 16, Math.min(72, w * 0.12), theme.accent)
  motif(ctx, theme.motif, w - 86, 20, Math.min(64, w * 0.1), theme.accent)
  motif(ctx, theme.motif, 16, h - 88, Math.min(56, w * 0.09), theme.accent)
  motif(ctx, theme.motif, w - 78, h - 84, Math.min(52, w * 0.08), theme.accent)
  ctx.restore()
}

function paintPosterChrome(ctx, theme, w, h) {
  paintScene(ctx, theme, w, h)
  ctx.fillStyle = theme.ink
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(theme.label, w / 2, 34)
}

function paintFrame(ctx, theme, w, h, inset, radius) {
  paintScene(ctx, theme, w, h)
  roundRect(ctx, inset, inset + 8, w - inset * 2, h - inset * 2 - 28, radius)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.fillStyle = theme.ink
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(theme.label, w / 2, h - 16)
}

function clipShape(ctx, x, y, size, shapeId) {
  ctx.beginPath()
  if (shapeId === 'round') {
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  } else {
    const r = shapeId === 'square' ? 0 : Math.round(size * 0.12)
    roundRect(ctx, x, y, size, size, r)
  }
  ctx.closePath()
  ctx.clip()
}

module.exports = {
  THEMES,
  findTheme,
  roundRect,
  paintPosterChrome,
  paintFrame,
  clipShape,
}
