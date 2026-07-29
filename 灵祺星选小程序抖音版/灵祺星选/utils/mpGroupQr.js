const mpOrderRegistryOps = require('./mpOrderRegistryOps.js')
const mpGroupQrExpiry = require('./mpGroupQrExpiry.js')
const mpGroupQrOssUpload = require('./mpGroupQrOssUpload.js')
const mpPrivacy = require('./mpPrivacyAuthorize.js')
const api = require('./api.js')
const auth = require('./auth.js')
const { normalizeHallPayload } = require('./hallRegistryParse.js')

const LOCAL_PREFIX = 'meoo_mp_group_qr_v1_'
const PATCH_PATHS = [
  '/api/meoo-ops-mp-recruitment-orders-patch',
  '/api/ops-sync/mp-recruitment-orders/patch',
]

function readLocalGroupQr(mpOrderId) {
  try {
    return String(wx.getStorageSync(`${LOCAL_PREFIX}${mpOrderId}`) || '').trim()
  } catch {
    return ''
  }
}

function writeLocalGroupQr(mpOrderId, url, opts) {
  try {
    wx.setStorageSync(`${LOCAL_PREFIX}${mpOrderId}`, url || '')
    if (!opts || !opts.skipSync) {
      try {
        require('./mpAccountClientSync.js').schedulePush()
      } catch (_) {}
    }
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
  if (/群码未写入|group_qr_missing|oss_not/i.test(msg)) return '群码未同步到服务器，请换网络后重试'
  if (/合法域名|domain/i.test(msg)) return msg
  if (/supabase|registry|patch_failed/i.test(msg)) return '服务器暂不可用，请稍后重试'
  if (/cloud|云函数|timeout/i.test(msg)) return '网络超时，请稍后重试'
  return msg.length > 32 ? `${msg.slice(0, 30)}…` : msg
}

async function verifyGroupQrOnServer(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return false
  try {
    const raw = await api.get(`/api/meoo-ops-mp-form-relay-group-qr?mpOrderId=${encodeURIComponent(id)}`)
    const url = String((raw && raw.groupQrImage) || '').trim()
    if (raw && raw.ok === true && url) return true
  } catch (_) {
    /* fall through */
  }
  try {
    const headers = auth.authHeaders ? auth.authHeaders() : {}
    const raw = await api.post(
      '/api/meoo-ops-mp-auth',
      { action: 'hall_registry', includeMpOrderIds: [id] },
      headers,
    )
    const hit = groupQrFromRegistry(normalizeHallPayload(raw), id)
    return !!String(hit || '').trim()
  } catch (_) {
    return false
  }
}

async function postGroupQrUrlPatch(id, imageUrl) {
  const body = { id, groupQrImage: imageUrl }
  const ecs = require('./ecs.js')
  if (ecs.postHttpsBypassCloud) {
    for (const path of PATCH_PATHS) {
      try {
        return await ecs.postHttpsBypassCloud(path, body)
      } catch (e) {
        if (!/404|not_found/i.test(String((e && e.message) || e))) throw e
      }
    }
  }
  return mpOrderRegistryOps.patchGroupQrImage(id, imageUrl)
}

/** 选图并压缩，返回 tempFilePath（用于预览 + OSS 上传） */
function chooseGroupQrImageFile() {
  return mpPrivacy
    .runChooseMedia(
      {
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
      },
      { purpose: '上传群二维码' },
    )
    .then((res) => {
      if (!res) return Promise.reject(new Error('cancel'))
      const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
      if (!path) return Promise.reject(new Error('未选择图片'))
      return new Promise((resolve, reject) => {
        wx.compressImage({
          src: path,
          quality: 72,
          compressedWidth: 720,
          compressedHeight: 720,
          success: (c) => resolve(String(c.tempFilePath || path)),
          fail: () => resolve(String(path)),
        })
      })
    })
}

/** @deprecated 预览仍可用；发布/补传请走 upload + patch */
function chooseAndReadImageDataUrl() {
  return chooseGroupQrImageFile()
}

function isGroupQrSyncedToServer(url) {
  return mpGroupQrOssUpload.isHttpsUrl(url)
}

async function resolveGroupQrForNotify(mpOrderId, imageRef) {
  const id = String(mpOrderId || '').trim()
  let ref = String(imageRef || '').trim()
  if (!ref) throw new Error('请先上传群二维码')

  const local = readLocalGroupQr(id)
  if (isGroupQrSyncedToServer(local)) ref = local

  async function ensureVerifiedOnServer(imageUrl) {
    const url = String(imageUrl || '').trim()
    if (!isGroupQrSyncedToServer(url)) {
      throw new Error('群码尚未上传完成，请重新上传后再通知')
    }
    if (await verifyGroupQrOnServer(id)) return url
    await postGroupQrUrlPatch(id, url)
    if (await verifyGroupQrOnServer(id)) return url
    throw new Error('群码未同步到服务器，请换网络后重新上传')
  }

  if (isGroupQrSyncedToServer(ref)) {
    return ensureVerifiedOnServer(ref)
  }

  const patched = await patchGroupQrImage(id, ref)
  return ensureVerifiedOnServer(patched.imageUrl || ref)
}

async function patchGroupQrImage(mpOrderId, imageRef) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  const ref = String(imageRef || '').trim()
  if (!ref) throw new Error('未读取到图片')

  let imageUrl = ref
  if (!mpGroupQrOssUpload.isHttpsUrl(ref)) {
    imageUrl = await mpGroupQrOssUpload.uploadGroupQrFileToOss(id, ref)
  }

  writeLocalGroupQr(id, imageUrl)
  try {
    await postGroupQrUrlPatch(id, imageUrl)
    void verifyGroupQrOnServer(id).then((ok) => {
      if (!ok) console.warn('[mpGroupQr] patch ok but verify pending', id)
    })
    return { localOnly: false, imageUrl }
  } catch (e) {
    const err = new Error(formatPatchError(e))
    err.localSaved = true
    throw err
  }
}

async function clearGroupQrImage(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('参数无效')
  writeLocalGroupQr(id, '')
  await postGroupQrUrlPatch(id, '')
  return { ok: true }
}

function exportGroupQrCacheForSync() {
  const out = {}
  try {
    const info = wx.getStorageInfoSync()
    const keys = info.keys || []
    for (let i = 0; i < keys.length; i++) {
      const k = String(keys[i] || '')
      if (!k.startsWith(LOCAL_PREFIX)) continue
      const id = k.slice(LOCAL_PREFIX.length).trim()
      const url = String(wx.getStorageSync(k) || '').trim()
      if (id && url) out[id] = url
    }
  } catch (_) {}
  return out
}

function applyGroupQrCacheFromSync(remote) {
  if (!remote || typeof remote !== 'object') return
  const entries = Object.entries(remote)
  for (let i = 0; i < entries.length; i++) {
    const id = String(entries[i][0] || '').trim()
    const url = String(entries[i][1] || '').trim()
    if (!id) continue
    writeLocalGroupQr(id, url, { skipSync: true })
  }
}

module.exports = {
  readLocalGroupQr,
  writeLocalGroupQr,
  groupQrFromMp,
  groupQrFromRegistry,
  isGroupQrSyncedToServer,
  resolveGroupQrForNotify,
  verifyGroupQrOnServer,
  patchGroupQrImage,
  clearGroupQrImage,
  chooseGroupQrImageFile,
  chooseAndReadImageDataUrl,
  exportGroupQrCacheForSync,
  applyGroupQrCacheFromSync,
  isGroupQrExpired: mpGroupQrExpiry.isGroupQrExpired,
  resolveDeadlineMs: mpGroupQrExpiry.resolveDeadlineMs,
}
