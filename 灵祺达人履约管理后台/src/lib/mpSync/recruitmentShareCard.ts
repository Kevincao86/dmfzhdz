/**
 * 招募微信卡片封面 5:4。版式与达人小程序 recruitShareCard.js 一致。
 */
import { extractPosterFieldsFromOrder, extractPosterTagsFromOrder } from './recruitmentSharePosterCore'

const CARD_W = 750
const CARD_H = 600

type CardView = {
  title: string
  platform: string
  typeLabel: string
  category: string
  price: string
  city: string
  fans: string
  deadline: string
  brand: string
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const s = String(text || '')
  if (!s || ctx.measureText(s).width <= maxWidth) return s
  let out = s
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function chipText(raw: string): string {
  const s = String(raw || '').trim()
  if (!s || s === '不限' || s === '—' || s === '-') return ''
  return s.slice(0, 8)
}

function compactPrice(raw: string): string {
  const s = String(raw || '').trim()
  if (!s || s === '—' || s === '面议') return ''
  if (/置换/.test(s) && !/\d/.test(s)) return '置换'
  if (/自报价/.test(s) && !/\d/.test(s)) return '自报价'
  const nums = s.match(/[\d]+(?:\.[\d]+)?/g)
  if (!nums?.length) return ''
  const a = nums[0]
  const b = nums[nums.length - 1]
  if (a === b) return `¥${a}`
  return `¥${a}–${b}`
}

function displayCity(raw: string): string {
  const s = String(raw || '').trim()
  if (!s || s === '—' || s === '不限' || s === '全国') return '全国'
  return (
    s
      .split(/[、,，]/)
      .map((part) => part.trim().replace(/(市|省)$/g, ''))
      .filter(Boolean)
      .join('、') || s
  )
}

function formatFans(raw: string): string {
  const s = String(raw || '').trim().replace(/^粉丝要求[:：]\s*/, '').replace(/^粉丝/, '')
  if (!s || s === '不限' || s === '—' || !/\d|万/.test(s)) return ''
  const marked = s.match(/[≥≧>]?\s*[\d.]+\s*万?/)
  if (!marked && !/万/.test(s)) return ''
  let v = (marked ? marked[0] : s).replace(/\s/g, '')
  if (!/^[≥≧>]/.test(v)) v = `≥${v.replace(/^>=/, '')}`
  return v.replace(/^>/, '≥')
}

function deadlineLabel(fields: ReturnType<typeof extractPosterFieldsFromOrder>): string {
  const row = fields.rows.find((item) => item.label === '报名截止')
  const raw = String(row?.value || '').trim()
  if (!raw || raw === '未设置' || raw === '—' || raw === '-') return ''
  const matched = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (matched) return `${Number(matched[2])}月${Number(matched[3])}日截止`
  return raw.slice(0, 16)
}

function readCardView(order: Record<string, unknown>): CardView {
  const fields = extractPosterFieldsFromOrder(order)
  const tags = extractPosterTagsFromOrder(order)
  const typeLabel = chipText(tags.orderTypeLabel)
  const category = chipText(tags.categoryTags[0] || '')
  return {
    title: String(fields.title || '').trim() || '达人招募',
    platform: chipText(tags.platformLabel),
    typeLabel,
    category: category && category !== typeLabel ? category : '',
    price: compactPrice(fields.feeTypeText) || (/置换/.test(fields.feeTypeText) ? '置换' : /自报价/.test(fields.feeTypeText) ? '自报价' : '面议'),
    city: displayCity(fields.cityText),
    fans: formatFans(fields.fansText),
    deadline: deadlineLabel(fields),
    brand: '灵祺星选',
  }
}

function wrapTitle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = Array.from(String(text || '达人招募').trim() || '达人招募')
  const lines: string[] = []
  let line = ''
  let index = 0
  while (index < chars.length && lines.length < 2) {
    const next = line + chars[index]
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = ''
      continue
    }
    line = next
    index += 1
  }
  if (line && lines.length < 2) lines.push(line)
  if (lines.length === 2 && index < chars.length) {
    lines[1] = fitText(ctx, lines[1] + chars.slice(index).join(''), maxWidth)
  }
  return lines
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
  const w = Math.ceil(ctx.measureText(text).width) + 24
  ctx.fillStyle = '#f4ebe3'
  roundRect(ctx, x, y, w, 36, 18)
  ctx.fill()
  ctx.fillStyle = '#6a4a38'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + 18)
  return w
}

function drawShareCard(ctx: CanvasRenderingContext2D, view: CardView) {
  ctx.fillStyle = '#f6efe6'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const glow = ctx.createRadialGradient(140, 0, 10, 140, 40, 220)
  glow.addColorStop(0, 'rgba(255,214,170,0.55)')
  glow.addColorStop(1, 'rgba(255,214,170,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const pad = 22
  const left = pad
  const top = pad
  const right = CARD_W - pad
  const bottom = CARD_H - pad
  ctx.fillStyle = '#fffdfb'
  roundRect(ctx, left, top, right - left, bottom - top, 28)
  ctx.fill()

  const innerL = left + 30
  const innerR = right - 30
  const chipY = top + 26
  let chipX = innerL
  for (const text of [view.platform, view.typeLabel, view.category].filter(Boolean)) {
    if (chipX > innerR - 180) break
    chipX += drawChip(ctx, text, chipX, chipY) + 10
  }
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#a08b7a'
  ctx.fillText(fitText(ctx, view.brand, 150), innerR, chipY + 18)

  const font = '"PingFang SC", "Microsoft YaHei", sans-serif'
  const ctaH = 64
  const ctaY = bottom - 26 - ctaH
  const bandTop = chipY + 56
  const bandBottom = ctaY - 22
  ctx.font = `bold 44px ${font}`
  const titleLines = wrapTitle(ctx, view.title, innerR - innerL)
  const titleH = Math.max(titleLines.length, 1) * 54
  const stripH = view.deadline ? 148 : 108
  const groupH = titleH + 18 + stripH
  let groupTop = bandTop + Math.max(0, (bandBottom - bandTop - groupH) / 2)
  if (groupTop + groupH > bandBottom) groupTop = Math.max(bandTop, bandBottom - groupH)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#221c18'
  ctx.font = `bold 44px ${font}`
  titleLines.forEach((line, index) => {
    ctx.fillText(line, innerL, groupTop + 22 + index * 54)
  })

  const stripY = groupTop + titleH + 18
  const stripW = innerR - innerL
  ctx.fillStyle = '#f7f1ea'
  roundRect(ctx, innerL, stripY, stripW, stripH, 20)
  ctx.fill()

  const factTop = stripY
  const factH = view.deadline ? stripH - 52 : stripH
  const cols = [
    { text: view.price || '面议', color: '#e23a2e', size: 40 },
    { text: view.city || '全国', color: '#221c18', size: 32 },
  ]
  const colW = stripW / cols.length
  cols.forEach((col, index) => {
    const cx = innerL + colW * (index + 0.5)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = col.color
    ctx.font = `bold ${col.size}px ${font}`
    ctx.fillText(fitText(ctx, col.text, colW - 28), cx, factTop + factH / 2)
    if (index) {
      ctx.strokeStyle = '#eadfd3'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(innerL + colW * index, factTop + 22)
      ctx.lineTo(innerL + colW * index, factTop + factH - 22)
      ctx.stroke()
    }
  })
  if (view.deadline) {
    ctx.strokeStyle = '#eadfd3'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(innerL + 22, stripY + factH)
    ctx.lineTo(innerR - 22, stripY + factH)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#8d7b6e'
    ctx.font = `22px ${font}`
    ctx.fillText(fitText(ctx, view.deadline, stripW - 40), innerL + stripW / 2, stripY + factH + 26)
  }

  const grad = ctx.createLinearGradient(innerL, 0, innerR, 0)
  grad.addColorStop(0, '#ff6038')
  grad.addColorStop(1, '#ff3a2e')
  ctx.fillStyle = grad
  roundRect(ctx, innerL, ctaY, innerR - innerL, ctaH, ctaH / 2)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('立即报名', (innerL + innerR) / 2, ctaY + ctaH / 2)
}

export async function buildRecruitmentShareCardDataUrl(order: Record<string, unknown>): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('封面生成失败')
  drawShareCard(ctx, readCardView(order))
  return canvas.toDataURL('image/jpeg', 0.86)
}
