/**
 * 租户知识库（对齐 Web knowledgeBaseApi → POST /api/meoo-kb）
 */
const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')
const sessionSync = require('./merchantSessionSyncMp.js')

function tenantId() {
  try {
    return String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {
    return ''
  }
}

function postKb(body) {
  const token = api.getBearerToken()
  return merchantRequestAuth('POST', '/api/meoo-kb', { data: body || {}, bearerToken: token }).then(
    (r) => r || {},
  )
}

async function listDocuments() {
  const tid = tenantId()
  if (!tid) return { ok: false, message: '未找到租户，请先登录', documents: [] }
  try {
    const r = await postKb({ action: 'list', scope: 'tenant', tenantId: tid })
    if (r.ok === false) {
      return { ok: false, message: String(r.detail || r.error || '加载失败'), documents: [] }
    }
    const documents = Array.isArray(r.documents) ? r.documents : []
    return { ok: true, documents }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '加载失败', documents: [] }
  }
}

async function uploadPlainText(params) {
  const tid = tenantId()
  if (!tid) return { ok: false, message: '未找到租户，请先登录' }
  const title = String((params && params.title) || '').trim() || '未命名资料'
  const plainText = String((params && params.plainText) || '').trim()
  if (!plainText) return { ok: false, message: '请填写文本内容' }
  try {
    const r = await postKb({
      action: 'upload',
      scope: 'tenant',
      tenantId: tid,
      title,
      fileName: `${title}.txt`,
      contentType: 'text/plain',
      plainText,
      summary: String((params && params.summary) || '').trim(),
      visibility: 'tenant_agents',
      feedEnabled: true,
    })
    if (r.ok === false || !r.document) {
      return { ok: false, message: String(r.detail || r.error || '上传失败') }
    }
    return { ok: true, document: r.document }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '上传失败' }
  }
}

async function deleteDocument(documentId) {
  const tid = tenantId()
  if (!tid) return { ok: false, message: '未找到租户' }
  const id = String(documentId || '').trim()
  if (!id) return { ok: false, message: '缺少文档 ID' }
  try {
    const r = await postKb({ action: 'delete', scope: 'tenant', tenantId: tid, documentId: id })
    if (r.ok === false) return { ok: false, message: String(r.detail || r.error || '删除失败') }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '删除失败' }
  }
}

module.exports = { tenantId, listDocuments, uploadPlainText, deleteDocument }
