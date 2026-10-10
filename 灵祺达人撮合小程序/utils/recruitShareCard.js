/**
 * 招募分享卡片（微信 5:4）：米色底图 + 白卡片。
 * 平台 logo、等级、粉丝、价格、城市按招募单填入；中间不放装饰图标。
 */
const posterCore = require('./recruitmentSharePosterCore.js')
const hallFilters = require('./recruitmentHallFilters.js')

const CARD_W = 750
const CARD_H = 600
const BG_SRC = '/images/share/recruit-card-bg.jpg'
const SLOGAN = '同城探店 · 速来报名'

const cache = Object.create(null)
const inflight = Object.create(null)

function fitText(ctx, text, maxWidth) {
  const s = String(text || '')
  if (!s) return ''
  if (ctx.measureText(s).width <= maxWidth) return s
  let out = s
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function isUnset(raw) {
  const s = String(raw || '').trim()
  return !s || s === '—' || s === '-' || s === '不限' || s === '未填写' || s === '无' || s === '面议'
}

function formatLevel(raw) {
  const s = String(raw || '').trim()
  if (isUnset(s)) return ''
  if (/不限/.test(s) && !/\d|万/.test(s)) return ''
  return s
}

function formatFans(raw) {
  const s = String(raw || '').trim().replace(/^粉丝要求[:：]\s*/, '').replace(/^粉丝/, '')
  if (isUnset(s)) return ''
  if (/不限/.test(s) && !/\d|万/.test(s)) return ''
  const marked = s.match(/[≥≧>]?\s*[\d.]+\s*万?/)
  if (!marked && !/万/.test(s)) return ''
  let v = (marked ? marked[0] : s).replace(/\s/g, '')
  if (!/^[≥≧>]/.test(v)) v = `≥${v.replace(/^>=/, '')}`
  return v.replace(/^>/, '≥')
}

function compactPrice(raw) {
  const s = String(raw || '').trim()
  if (isUnset(s)) return ''
  if (/置换/.test(s) && !/\d/.test(s)) return '置换'
  if (/自报价/.test(s) && !/\d/.test(s)) return '自报价'
  const nums = s.match(/[\d]+(?:\.[\d]+)?/g)
  if (!nums || !nums.length) return ''
  const a = nums[0]
  const b = nums[nums.length - 1]
  if (a === b) return `¥${a}`
  return `¥${a}-${b}`
}

function compactCity(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '—' || s === '不限') return '全国'
  return s
}

function wrapCityLines(ctx, text, maxWidth) {
  const parts = String(text || '')
    .split(/[、,，/;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const tokens = parts.length ? parts : [String(text || '').trim()].filter(Boolean)
  const lines = []
  let line = ''
  tokens.forEach((token) => {
    const next = line ? `${line}、${token}` : token
    if (ctx.measureText(next).width <= maxWidth) {
      line = next
      return
    }
    if (line) lines.push(line)
    if (ctx.measureText(token).width <= maxWidth) {
      line = token
      return
    }
    let buf = ''
    for (let i = 0; i < token.length; i += 1) {
      const ch = token[i]
      if (buf && ctx.measureText(buf + ch).width > maxWidth) {
        lines.push(buf)
        buf = ch
      } else {
        buf += ch
      }
    }
    line = buf
  })
  if (line) lines.push(line)
  return lines
}

function readCardFields(order) {
  const fields = posterCore.extractPosterFieldsFromOrder(order || {})
  const platform = hallFilters.normalizeHallPlatform(fields.platform)
  return {
    platform,
    logo: hallFilters.platformIcon(platform),
    slogan: SLOGAN,
    level: formatLevel(fields.levelText),
    fans: formatFans(fields.fansText),
    price: compactPrice(fields.feeTypeText),
    city: compactCity(fields.cityText),
  }
}

function cacheKey(order, view) {
  return [String((order && order.id) || ''), view.platform, view.level, view.fans, view.price, view.city].join('|')
}

function loadImage(canvas, src) {
  const url = String(src || '').trim()
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    } catch (_) {
      resolve(null)
    }
  })
}

function drawCover(ctx, img, w, h) {
  const iw = img.width || w
  const ih = img.height || h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function drawCard(ctx, view, bg, logo) {
  if (bg) drawCover(ctx, bg, CARD_W, CARD_H)
  else {
    ctx.fillStyle = '#F3E6D4'
    ctx.fillRect(0, 0, CARD_W, CARD_H)
  }

  const card = [108, 64, 642, 536]
  ctx.fillStyle = 'rgba(120, 86, 52, 0.16)'
  roundRect(ctx, card[0] + 2, card[1] + 6, card[2] - card[0], card[3] - card[1], 24)
  ctx.fill()
  ctx.fillStyle = '#FFFCF8'
  roundRect(ctx, card[0], card[1], card[2] - card[0], card[3] - card[1], 24)
  ctx.fill()

  ctx.strokeStyle = '#C4A27A'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(card[0] + 22, card[1] + 22, 11, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(card[2] - 22, card[1] + 22, 11, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(card[0] + 20, card[3] - 22, 8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(card[2] - 20, card[3] - 22, 8, 0, Math.PI * 2)
  ctx.stroke()

  const logoSize = 48
  const logoX = card[0] + 36
  const logoY = card[1] + 22
  if (logo) ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#7A482A'
  ctx.font = 'bold 17px sans-serif'
  const sloganMax = card[2] - 28 - (logoX + logoSize + 16)
  ctx.fillText(fitText(ctx, view.slogan, sloganMax), card[2] - 28, logoY + logoSize / 2)

  const panel = [card[0] + 20, card[1] + 96, card[2] - 20, card[1] + 250]
  ctx.fillStyle = '#F8F3EC'
  roundRect(ctx, panel[0], panel[1], panel[2] - panel[0], panel[3] - panel[1], 16)
  ctx.fill()

  const cols = [
    { label: '达人等级', value: view.level, color: '#221C18' },
    { label: '达人粉丝', value: view.fans, color: '#221C18' },
    { label: '价格', value: view.price, color: '#E23A2E' },
  ]
  const pw = panel[2] - panel[0]
  const colW = pw / 3
  ctx.textAlign = 'center'
  cols.forEach((col, i) => {
    const cx = panel[0] + colW * (i + 0.5)
    ctx.fillStyle = '#9A9086'
    ctx.font = '13px sans-serif'
    ctx.fillText(col.label, cx, panel[1] + 36)
    if (col.value) {
      ctx.fillStyle = col.color
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText(fitText(ctx, col.value, colW - 16), cx, panel[1] + 84)
    }
    if (i) {
      ctx.strokeStyle = '#E8DCCE'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(panel[0] + colW * i, panel[1] + 28)
      ctx.lineTo(panel[0] + colW * i, panel[3] - 28)
      ctx.stroke()
    }
  })

  const bh = 52
  const bx1 = card[0] + 26
  const bx2 = card[2] - 26
  const by2 = card[3] - 18
  const by1 = by2 - bh
  const mid = (card[0] + card[2]) / 2

  const cityMaxW = card[2] - card[0] - 56
  const cityTop = panel[3] + 8
  const cityBottom = by1 - 10
  let citySize = 16
  let cityLines = []
  let cityLineH = 22
  while (citySize >= 12) {
    ctx.font = `bold ${citySize}px sans-serif`
    cityLines = wrapCityLines(ctx, view.city, cityMaxW)
    cityLineH = citySize + 6
    const blockH = 16 + cityLines.length * cityLineH
    if (blockH <= cityBottom - cityTop || citySize === 12) break
    citySize -= 1
  }
  const cityBlockH = 16 + Math.max(cityLines.length, 1) * cityLineH
  let cityLabelY = cityBottom - cityBlockH
  if (cityLabelY < cityTop) cityLabelY = cityTop
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#9A9086'
  ctx.font = '12px sans-serif'
  ctx.fillText('城市', mid, cityLabelY)
  ctx.fillStyle = '#221C18'
  ctx.font = `bold ${citySize}px sans-serif`
  cityLines.forEach((line, index) => {
    const y = cityLabelY + 16 + index * cityLineH
    if (y > cityBottom) return
    ctx.fillText(line, mid, y)
  })

  const grad = ctx.createLinearGradient(bx1, 0, bx2, 0)
  grad.addColorStop(0, '#FF6038')
  grad.addColorStop(1, '#FF3A2E')
  ctx.fillStyle = grad
  roundRect(ctx, bx1, by1, bx2 - bx1, bh, bh / 2)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('立即报名', (bx1 + bx2) / 2, by1 + bh / 2)
}

function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: CARD_W,
      height: CARD_H,
      destWidth: CARD_W,
      destHeight: CARD_H,
      fileType: 'jpg',
      quality: 0.86,
      success(res) {
        resolve(res.tempFilePath || '')
      },
      fail(err) {
        reject(err || new Error('share_card_export_fail'))
      },
    })
  })
}

function buildShareCardPath(order) {
  const view = readCardFields(order)
  const key = cacheKey(order, view)
  if (cache[key]) return Promise.resolve(cache[key])
  if (inflight[key]) return inflight[key]
  let canvas
  try {
    canvas = wx.createOffscreenCanvas({ type: '2d', width: CARD_W, height: CARD_H })
  } catch (err) {
    return Promise.reject(err)
  }
  const ctx = canvas.getContext('2d')
  const job = Promise.all([loadImage(canvas, BG_SRC), loadImage(canvas, view.logo)])
    .then(([bg, logo]) => {
      drawCard(ctx, view, bg, logo)
      return exportCanvas(canvas)
    })
    .then((path) => {
      const ready = String(path || '').trim()
      if (ready) cache[key] = ready
      return ready
    })
    .finally(() => {
      delete inflight[key]
    })
  inflight[key] = job
  return job
}

function readShareCoverKind(res) {
  if (!res || res.from !== 'button' || !res.target) return ''
  const ds = res.target.dataset || {}
  return String(ds.cover || '')
}

module.exports = {
  SLOGAN,
  buildShareCardPath,
  readCardFields,
  readShareCoverKind,
}
