const mpOrderRegistryOps = require('./mpOrderRegistryOps.js')
const mpGroupQrExpiry = require('./mpGroupQrExpiry.js')

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'
/** 云端注册表 JSON 安全上限（base64 data URL） */
const MAX_DATA_URL_LEN = 120000

function readLocalGroupQr(mpOrderId) {
  try {
    return String(wx.getStorageSync(`${LOCAL_PREFIX}${mpOrderId}`) || '').trim()
  } catch {
    return ''
  }
}

function writeLocalGroupQr(mpOrderId, dataUrl) {
  try {
    wx.setStorageSync(`${LOCAL_PREFIX}${mpOrderId}`, dataUrl || '')
  } catch (e) {
    const msg = String((e && e.message) || e || '')
    if (/exceed|quota|limit/i.test(msg)) {
      throw new Error('本机存储空间不足，请清理缓存后重试')
    }
    throw new Error('保存群码到本机失败')
  }
}

function groupQrFromMp(mp) {
  if (!mp) return ''
  if (mpGroupQrExpiry.isGroupQrExpired(mp)) {
    const id = String(mp.id || '').trim()
    if (id) writeLocalGroupQr(id, '')
    return ''
  }
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const remote = String(mp.groupQrImage || meta.groupQrImage || '').trim()
  if (remote) return remote
  const id = String(mp.id || '').trim()
  return id ? readLocalGroupQr(id) : ''
}

function groupQrFromRegistry(reg, mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id || !reg) return ''
  const map = reg.mpGroupQrByOrderId && typeof reg.mpGroupQrByOrderId === 'object' ? reg.mpGroupQrByOrderId : null
  if (map && map[id]) return String(map[id]).trim()
  const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === id)
  return groupQrFromMp(mp)
}

function formatPatchError(e) {
  const msg = String((e && e.message) || e || '保存失败')
  if (/group_qr_too_large|过大/i.test(msg)) return '二维码图片过大，请换一张截图重试'
  if (/not_found|404/i.test(msg)) return '招募单不存在，请返回列表刷新后重试'
  if (/supabase|registry|patch_failed/i.test(msg)) return '服务器暂不可用，群码已存本机，请稍后重试'
  if (/cloud|云函数|timeout/i.test(msg)) return '网络超时，群码已存本机，请稍后重试'
  return msg.length > 32 ? `${msg.slice(0, 30)}…` : msg
}

async function patchGroupQrImage(mpOrderId, groupQrImage) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  const img = String(groupQrImage || '').trim()
  if (!img) throw new Error('未读取到图片')
  if (img.length > MAX_DATA_URL_LEN) {
    throw new Error('二维码图片过大，请换一张更小的截图')
  }
  writeLocalGroupQr(id, img)
  try {
    await mpOrderRegistryOps.patchGroupQrImage(id, img)
    return { localOnly: false }
  } catch (e) {
    const err = new Error(formatPatchError(e))
    err.localSaved = true
    throw err
  }
}

function readPathAsDataUrl(filePath, attempt) {
  const n = attempt || 0
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const mime = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
        const dataUrl = `data:${mime};base64,${r.data}`
        if (dataUrl.length <= MAX_DATA_URL_LEN) {
          resolve(dataUrl)
          return
        }
        if (n >= 3) {
          reject(new Error('二维码图片过大，请换一张更小的截图'))
          return
        }
        wx.compressImage({
          src: filePath,
          quality: Math.max(42, 68 - n * 12),
          compressedWidth: 480,
          compressedHeight: 480,
          success: (c) => {
            readPathAsDataUrl(c.tempFilePath || filePath, n + 1)
              .then(resolve)
              .catch(reject)
          },
          fail: () => reject(new Error('压缩图片失败，请换一张截图')),
        })
      },
      fail: () => reject(new Error('读取图片失败')),
    })
  })
}

function chooseAndReadImageDataUrl() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!path) {
          reject(new Error('未选择图片'))
          return
        }
        wx.compressImage({
          src: path,
          quality: 68,
          compressedWidth: 560,
          compressedHeight: 560,
          success: (c) => {
            readPathAsDataUrl(c.tempFilePath || path, 0).then(resolve).catch(reject)
          },
          fail: () => {
            readPathAsDataUrl(path, 0).then(resolve).catch(reject)
          },
        })
      },
      fail: (e) => {
        if (e && e.errMsg && /cancel/.test(e.errMsg)) reject(new Error('cancel'))
        else reject(new Error('选择图片失败'))
      },
    })
  })
}

module.exports = {
  readLocalGroupQr,
  writeLocalGroupQr,
  groupQrFromMp,
  groupQrFromRegistry,
  patchGroupQrImage,
  chooseAndReadImageDataUrl,
  isGroupQrExpired: mpGroupQrExpiry.isGroupQrExpired,
  resolveDeadlineMs: mpGroupQrExpiry.resolveDeadlineMs,
}
