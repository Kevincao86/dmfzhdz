function orderRequiresTalentInvoice(mp) {
  if (!mp) return false
  if (mp.requireTalentInvoice === true) return true
  const meta = mp.mpPublishMeta
  return !!(meta && typeof meta === 'object' && meta.requireTalentInvoice === true)
}

function safeFileName(raw, fallback) {
  const name = String(raw || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
  return name || fallback
}

function collectTalentInvoices(mp) {
  const apps = mp && Array.isArray(mp.applicants) ? mp.applicants : []
  const rows = []
  apps.forEach((a) => {
    const files = a && Array.isArray(a.talentInvoices) ? a.talentInvoices : []
    const name = String((a && (a.platformNickname || a.name)) || '达人').trim() || '达人'
    files.forEach((f, i) => {
      const url = String((f && f.url) || '').trim()
      if (!/^https:\/\//i.test(url)) return
      rows.push({
        key: `${String((a && a.id) || 'a')}-${i}`,
        applicantId: String((a && a.id) || ''),
        name,
        url,
        fileName: safeFileName(f && f.fileName, `${name}-${i + 1}.jpg`),
      })
    })
  })
  return rows
}

function crc32(data) {
  let c = ~0
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function u16(view, offset, n) {
  view.setUint16(offset, n, true)
}

function u32(view, offset, n) {
  view.setUint32(offset, n, true)
}

function buildStoredZip(files) {
  const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null
  const encode = (s) => {
    if (encoder) return encoder.encode(s)
    const out = []
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c < 0x80) out.push(c)
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
    return new Uint8Array(out)
  }
  const locals = []
  const centrals = []
  let offset = 0
  files.forEach((file) => {
    const name = encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + name.length + file.data.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50)
    u16(lv, 4, 20)
    u16(lv, 6, 0x0800)
    u32(lv, 14, crc)
    u32(lv, 18, file.data.length)
    u32(lv, 22, file.data.length)
    u16(lv, 26, name.length)
    local.set(name, 30)
    local.set(file.data, 30 + name.length)
    locals.push(local)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    u32(cv, 0, 0x02014b50)
    u16(cv, 4, 20)
    u16(cv, 6, 20)
    u16(cv, 8, 0x0800)
    u32(cv, 16, crc)
    u32(cv, 20, file.data.length)
    u32(cv, 24, file.data.length)
    u16(cv, 28, name.length)
    u32(cv, 42, offset)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  })
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50)
  u16(ev, 8, files.length)
  u16(ev, 10, files.length)
  u32(ev, 12, centralSize)
  u32(ev, 16, offset)
  const out = new Uint8Array(offset + centralSize + end.length)
  let p = 0
  locals.forEach((b) => {
    out.set(b, p)
    p += b.length
  })
  centrals.forEach((b) => {
    out.set(b, p)
    p += b.length
  })
  out.set(end, p)
  return out
}

function downloadArrayBuffer(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (!res.tempFilePath || res.statusCode >= 400) {
          reject(new Error('图片暂时下不下来'))
          return
        }
        wx.getFileSystemManager().readFile({
          filePath: res.tempFilePath,
          success(r) {
            resolve(new Uint8Array(r.data))
          },
          fail() {
            reject(new Error('图片暂时下不下来'))
          },
        })
      },
      fail() {
        reject(new Error('图片暂时下不下来'))
      },
    })
  })
}

function previewInvoice(url, urls) {
  const list = (urls || []).filter(Boolean)
  wx.previewImage({ current: url, urls: list.length ? list : [url] })
}

function shareZip(bytes, zipName) {
  const path = `${wx.env.USER_DATA_PATH}/${zipName}`
  wx.getFileSystemManager().writeFile({
    filePath: path,
    data: bytes.buffer,
    success() {
      if (typeof wx.shareFileMessage === 'function') {
        wx.shareFileMessage({
          filePath: path,
          fileName: zipName,
          fail() {
            wx.openDocument({ filePath: path, fileType: 'zip', showMenu: true })
          },
        })
        return
      }
      wx.openDocument({ filePath: path, fileType: 'zip', showMenu: true })
    },
    fail() {
      wx.showToast({ title: '压缩包保存失败', icon: 'none' })
    },
  })
}

async function downloadInvoiceZip(rows, zipName) {
  const files = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const data = await downloadArrayBuffer(row.url)
    files.push({
      name: `${String(i + 1).padStart(2, '0')}-${row.name}-${row.fileName}`,
      data,
    })
  }
  shareZip(buildStoredZip(files), zipName)
}

module.exports = {
  orderRequiresTalentInvoice,
  collectTalentInvoices,
  previewInvoice,
  downloadInvoiceZip,
}
