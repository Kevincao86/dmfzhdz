const api = require('./api.js')
const participant = require('./participant.js')
const richMsg = require('./mpChatRichMessage.js')

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
    durationSec: payload.durationSec || 0,
    latitude: payload.latitude,
    longitude: payload.longitude,
    locationName: payload.locationName || '',
    fileName: payload.fileName || '',
    mentionKeys: payload.mentionKeys || [],
  })
}

function uploadMedia(filePath, contentType, fileName) {
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
            fileName: fileName || (/\.mp4$/i.test(filePath) ? 'chat.mp4' : /\.mp3$/i.test(filePath) ? 'chat.mp3' : 'chat.jpg'),
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

function messagePreview(m) {
  const type = m && m.type
  if (type === 'image') return '[图片]'
  if (type === 'video') return '[视频]'
  if (type === 'audio') return '[语音]'
  if (type === 'location') return `[位置] ${String(m.locationName || '').trim()}`.trim()
  if (type === 'file') return `[文件] ${String(m.fileName || '文件')}`
  return String(m.text || '').trim() || '暂无消息'
}

function mapMessages(group, myKey) {
  const list = group && Array.isArray(group.messages) ? group.messages : []
  return list.map((m) => ({
    id: m.id,
    type: m.type || 'text',
    text: m.text || '',
    mediaUrl: m.mediaUrl || '',
    durationSec: Number(m.durationSec) || 0,
    latitude: m.latitude,
    longitude: m.longitude,
    locationName: m.locationName || '',
    fileName: m.fileName || '',
    mentionKeys: Array.isArray(m.mentionKeys) ? m.mentionKeys : [],
    fromName: m.fromName || '成员',
    fromParticipantKey: m.fromParticipantKey || '',
    mine: String(m.fromParticipantKey) === String(myKey),
    at: formatTime(m.ts),
    ts: m.ts || 0,
    previewLabel: messagePreview(m),
  }))
}

function mapMentionMembers(group, myKey) {
  const keys = (group && group.memberParticipantKeys) || []
  const names = (group && group.memberNames) || {}
  return keys
    .filter((k) => k && String(k) !== String(myKey))
    .map((k) => ({
      key: k,
      name: String(names[k] || '成员').trim() || '成员',
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
  return messagePreview(last)
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
  mapMentionMembers,
  mapGroupSessions,
  formatTime,
  myParticipantKey,
  messagePreview,
}
