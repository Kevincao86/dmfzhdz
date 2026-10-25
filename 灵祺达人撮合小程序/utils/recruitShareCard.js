/**
 * 招募分享卡片（微信 5:4）：米色底图 + 白卡片。
 * 平台 logo、等级、粉丝、价格、城市按招募单填入；中间不放装饰图标。
 */
const posterCore = require('./recruitmentSharePosterCore.js')
const hallFilters = require('./recruitmentHallFilters.js')
const ossBase = require('./recruitCoverOssBase.js')
const ossDisplay = require('./mpOssDisplayUrl.js')

const CARD_W = 750
const CARD_H = 600
const BG_OSS = `${String(ossBase || '').replace(/\/$/, '')}/share/recruit-card-bg.jpg?v=20261010c`
const BG_LOCAL = '/images/share/recruit-card-bg.jpg'
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

function chipText(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '不限' || s === '—' || s === '-') return ''
  return s.slice(0, 8)
}

function displayCity(raw) {
  const s = compactCity(raw)
  if (!s || s === '全国') return '全国'
  return s
    .split(/[、,，]/)
    .map((part) => part.trim().replace(/(市|省)$/g, ''))
    .filter(Boolean)
    .join('、') || s
}

function deadlineLabel(fields) {
  const rows = fields && Array.isArray(fields.rows) ? fields.rows : []
  const row = rows.find((item) => item && item.label === '报名截止')
  const raw = String((row && row.value) || '').trim()
  if (!raw || raw === '未设置' || raw === '—' || raw === '-') return ''
  const matched = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (matched) return `${Number(matched[2])}月${Number(matched[3])}日截止`
  return raw.slice(0, 16)
}

function priceLabel(raw) {
  const compact = compactPrice(raw)
  if (compact) return compact.replace('-', '–')
  const s = String(raw || '').trim()
  if (/置换/.test(s)) return '置换'
  if (/自报价/.test(s)) return '自报价'
  return '面议'
}

function wrapTitle(ctx, text, maxWidth) {
  const chars = Array.from(String(text || '达人招募').trim() || '达人招募')
  const lines = []
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

function readCardFields(order) {
  const fields = posterCore.extractPosterFieldsFromOrder(order || {})
  const tags = posterCore.extractPosterTagsFromOrder(order || {})
  const platform = chipText(hallFilters.normalizeHallPlatform(fields.platform))
  const typeLabel = chipText(tags.orderTypeLabel)
  const category = chipText((tags.categoryTags && tags.categoryTags[0]) || '')
  return {
    title: String(fields.title || '').trim() || '达人招募',
    platform: platform === '不限' ? '' : platform,
    typeLabel,
    category: category && category !== typeLabel ? category : '',
    price: priceLabel(fields.feeTypeText),
    city: displayCity(fields.cityText),
    fans: formatFans(fields.fansText),
    deadline: deadlineLabel(fields),
    brand: '灵祺星选',
  }
}

function cacheKey(order, view) {
  return [
    'card-20261025c',
    String((order && order.id) || ''),
    view.title,
    view.platform,
    view.typeLabel,
    view.category,
    view.price,
    view.city,
    view.deadline,
    view.brand,
  ].join('|')
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || typeof wx.downloadFile !== 'function') {
      reject(new Error('no_download'))
      return
    }
    wx.downloadFile({
      url: ossDisplay.rewriteOssDisplayUrl(url),
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('bg_download_failed'))
      },
      fail: reject,
    })
  })
}

function loadBackground(canvas) {
  return downloadFile(BG_OSS)
    .then((local) => loadImage(canvas, local))
    .then((img) => (img ? img : loadImage(canvas, BG_LOCAL)))
    .catch(() => loadImage(canvas, BG_LOCAL))
}

function loadImage(canvas, src) {
  const url = String(src || '').trim()
  if (!url) return Promise.resolve(null)
  const bind = (path) =>
    new Promise((resolve) => {
      try {
        const img = canvas.createImage()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = path || url
      } catch (_) {
        resolve(null)
      }
    })
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || typeof wx.getImageInfo !== 'function') {
      bind(url).then(resolve)
      return
    }
    wx.getImageInfo({
      src: url,
      success(info) {
        bind((info && (info.path || info.tempFilePath)) || url).then((img) => {
          if (img) resolve(img)
          else bind(url).then(resolve)
        })
      },
      fail() {
        bind(url).then(resolve)
      },
    })
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

function drawRoundedImage(ctx, img, x, y, size, radius) {
  ctx.save()
  roundRect(ctx, x, y, size, size, radius)
  ctx.clip()
  ctx.drawImage(img, x, y, size, size)
  ctx.restore()
}

function drawChip(ctx, text, x, y) {
  ctx.font = '18px sans-serif'
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

function drawCard(ctx, view) {
  ctx.fillStyle = '#f6efe6'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  const glow = ctx.createRadialGradient(140, 0, 10, 140, 40, 220)
  glow.addColorStop(0, 'rgba(255,214,170,0.55)')
  glow.addColorStop(1, 'rgba(255,214,170,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  const pad = 22
  const sheet = [pad, pad, CARD_W - pad, CARD_H - pad]
  ctx.fillStyle = '#fffdfb'
  roundRect(ctx, sheet[0], sheet[1], sheet[2] - sheet[0], sheet[3] - sheet[1], 28)
  ctx.fill()

  const innerL = sheet[0] + 30
  const innerR = sheet[2] - 30
  const chipY = sheet[1] + 26
  const chips = [view.platform, view.typeLabel, view.category].filter(Boolean)
  let chipX = innerL
  chips.forEach((text) => {
    if (chipX > innerR - 180) return
    chipX += drawChip(ctx, text, chipX, chipY) + 10
  })
  ctx.font = '18px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#a08b7a'
  ctx.fillText(fitText(ctx, view.brand || '灵祺星选', 150), innerR, chipY + 18)

  const ctaH = 64
  const ctaY = sheet[3] - 26 - ctaH
  const bandTop = chipY + 56
  const bandBottom = ctaY - 22
  ctx.font = 'bold 44px sans-serif'
  const titleLines = wrapTitle(ctx, view.title, innerR - innerL)
  const titleH = Math.max(titleLines.length, 1) * 54
  const stripH = view.deadline ? 148 : 108
  const groupH = titleH + 18 + stripH
  let groupTop = bandTop + Math.max(0, (bandBottom - bandTop - groupH) / 2)
  if (groupTop + groupH > bandBottom) groupTop = Math.max(bandTop, bandBottom - groupH)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#221c18'
  ctx.font = 'bold 44px sans-serif'
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
    ctx.font = `bold ${col.size}px sans-serif`
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
    ctx.font = '22px sans-serif'
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
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText('立即报名', (innerL + innerR) / 2, ctaY + ctaH / 2)
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
  const job = Promise.resolve()
    .then(() => {
      drawCard(ctx, view)
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
