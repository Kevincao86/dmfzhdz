const api = require('./api.js')
const participant = require('./participant.js')

const PATH = '/api/meoo-ops-mp-order-group-chat'
const POLL_MS = 3000

function post(body) {
  return api.post(PATH, body)
}

function myParticipantKey() {
  const me = participant.getCurrentParticipant()
  return String(me.participantKey || '').trim()
}

function createGroup(mpOrderId) {
  return post({
    action: 'create',
    mpOrderId,
    participantKey: myParticipantKey(),
  })
}

function getGroup(mpOrderId) {
  return post({
    action: 'get',
    mpOrderId,
    participantKey: myParticipantKey(),
  })
}

function sendMessage(mpOrderId, payload) {
  return post({
    action: 'send',
    mpOrderId,
    participantKey: myParticipantKey(),
    type: payload.type || 'text',
    text: payload.text || '',
    mediaUrl: payload.mediaUrl || '',
  })
}

function uploadMedia(filePath, contentType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: async (res) => {
        try {
          const out = await post({
            action: 'upload_media',
            contentBase64: String(res.data || ''),
            contentType: contentType || 'image/jpeg',
            fileName: /\.mp4$/i.test(filePath) ? 'chat.mp4' : 'chat.jpg',
          })
          resolve(out)
        } catch (e) {
          reject(e)
        }
      },
      fail: () => reject(new Error('读取文件失败')),
    })
  })
}

function formatTime(ts) {
  const d = new Date(ts || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mapMessages(group, myKey) {
  const list = group && Array.isArray(group.messages) ? group.messages : []
  return list.map((m) => ({
    id: m.id,
    type: m.type || 'text',
    text: m.text || '',
    mediaUrl: m.mediaUrl || '',
    fromName: m.fromName || '成员',
    fromParticipantKey: m.fromParticipantKey || '',
    mine: String(m.fromParticipantKey) === String(myKey),
    at: formatTime(m.ts),
    ts: m.ts || 0,
  }))
}

function listMine() {
  return post({
    action: 'list_mine',
    participantKey: myParticipantKey(),
  })
}

function lastMessagePreview(group) {
  const list = group && Array.isArray(group.messages) ? group.messages : []
  const last = list.length ? list[list.length - 1] : null
  if (!last) return '暂无消息'
  if (last.type === 'image') return '[图片]'
  if (last.type === 'video') return '[视频]'
  return String(last.text || '').trim() || '暂无消息'
}

function mapGroupSessions(groups) {
  return (groups || []).map((g) => {
    const list = g && Array.isArray(g.messages) ? g.messages : []
    const last = list.length ? list[list.length - 1] : null
    const ts = (last && last.ts) || Date.parse(String(g.lastMessageAt || g.createdAt || '').replace(/-/g, '/')) || 0
    return {
      id: g.id || g.mpOrderId,
      mpOrderId: g.mpOrderId,
      title: g.title || '商单群',
      memberCount: (g.memberParticipantKeys || []).length,
      lastText: lastMessagePreview(g),
      timeText: formatTime(ts),
      closed: g.status === 'closed',
    }
  })
}

module.exports = {
  POLL_MS,
  createGroup,
  getGroup,
  listMine,
  sendMessage,
  uploadMedia,
  mapMessages,
  mapGroupSessions,
  formatTime,
  myParticipantKey,
}
