const groupChatApi = require('./mpOrderGroupChatApi.js')
const emojiMod = require('./mpChatEmoji.js')
const mpPrivacy = require('./mpPrivacyAuthorize.js')

const PLUS_ACTIONS = [
  { id: 'image', label: '照片', iconClass: 'plus-icon--photo' },
  { id: 'camera', label: '拍摄', iconClass: 'plus-icon--camera' },
  { id: 'location', label: '位置', iconClass: 'plus-icon--location' },
  { id: 'file', label: '文件', iconClass: 'plus-icon--file' },
]

function composerPanelData() {
  return {
    showPlusPanel: false,
    showEmojiPanel: false,
    showMentionPanel: false,
    showSendBtn: false,
    voiceMode: false,
    recordingVoice: false,
    emojiTab: 'default',
    mentionSearchQ: '',
    filteredMentionMembers: [],
    chatEmojis: emojiMod.CHAT_EMOJIS,
    customEmojis: emojiMod.loadCustomEmojis(),
  }
}

function filterMentionMembers(members, q) {
  const query = String(q || '').trim().toLowerCase()
  const list = members || []
  if (!query) return list
  return list.filter((m) => String((m && m.name) || '').toLowerCase().includes(query))
}

function resolveMentionKeys(text, mentionMembers, pendingKeys) {
  const keys = []
  const body = String(text || '')
  const members = mentionMembers || []
  if (/@全体成员|@全体/.test(body)) {
    for (let i = 0; i < members.length; i++) {
      const k = members[i] && members[i].key
      if (k && keys.indexOf(k) < 0) keys.push(k)
    }
  }
  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    if (m && m.name && body.includes(`@${m.name}`) && keys.indexOf(m.key) < 0) keys.push(m.key)
  }
  const pending = pendingKeys || []
  for (let j = 0; j < pending.length; j++) {
    if (pending[j] && keys.indexOf(pending[j]) < 0) keys.push(pending[j])
  }
  return keys.slice(0, 20)
}

function syncFilteredMentionMembers(page) {
  const members = page.data.mentionMembers || []
  page.setData({
    filteredMentionMembers: filterMentionMembers(members, page.data.mentionSearchQ),
  })
}

function refreshCustomEmojis(page) {
  if (!page || !page.setData) return
  page.setData({ customEmojis: emojiMod.loadCustomEmojis() })
}

function onComposerInput(page, e) {
  const input = e && e.detail ? e.detail.value : ''
  const data = {
    input,
    showSendBtn: String(input || '').trim().length > 0,
  }
  const members = page.data.mentionMembers
  if (Array.isArray(members) && members.length && /@$/.test(String(input || ''))) {
    data.showMentionPanel = true
    data.showEmojiPanel = false
    data.showPlusPanel = false
    data.mentionSearchQ = ''
    data.filteredMentionMembers = members
  }
  page.setData(data)
}

function onTogglePlus(page) {
  if (!page.data.canSend) return
  const next = !page.data.showPlusPanel
  page.setData({ showPlusPanel: next, showEmojiPanel: false, showMentionPanel: false, voiceMode: false })
}

function onToggleEmoji(page) {
  if (!page.data.canSend) return
  const next = !page.data.showEmojiPanel
  page.setData({ showEmojiPanel: next, showPlusPanel: false, showMentionPanel: false, voiceMode: false })
}

function onToggleVoiceMode(page) {
  if (!page.data.canSend) return
  page.setData({
    voiceMode: !page.data.voiceMode,
    showPlusPanel: false,
    showEmojiPanel: false,
    showMentionPanel: false,
  })
}

function onOpenMentionPanel(page) {
  const members = page.data.mentionMembers || []
  if (!members.length) {
    wx.showToast({ title: '暂无可 @ 成员', icon: 'none' })
    return
  }
  page.setData({
    showMentionPanel: true,
    showEmojiPanel: false,
    showPlusPanel: false,
    mentionSearchQ: '',
    filteredMentionMembers: members,
  })
}

function onCloseMentionPanel(page) {
  page.setData({ showMentionPanel: false, mentionSearchQ: '' })
}

function onMentionSearch(page, e) {
  const q = e && e.detail ? e.detail.value : ''
  const members = page.data.mentionMembers || []
  page.setData({
    mentionSearchQ: q,
    filteredMentionMembers: filterMentionMembers(members, q),
  })
}

function onPickMentionMember(page, e) {
  const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
  const members = page.data.mentionMembers || []
  let input = page.data.input || ''
  let pending = [...(page.data.pendingMentionKeys || [])]
  if (ds.all) {
    input = `${input}@全体成员 `
    pending = members.map((m) => m.key).filter(Boolean)
  } else {
    const name = String(ds.name || '').trim()
    const key = String(ds.key || '').trim()
    if (!name) return
    input = `${input}@${name} `
    if (key && pending.indexOf(key) < 0) pending.push(key)
  }
  page.setData({
    input,
    showSendBtn: true,
    pendingMentionKeys: pending,
    showMentionPanel: false,
    mentionSearchQ: '',
  })
}

function onPickDefaultEmoji(page, e) {
  const emoji = e && e.currentTarget ? e.currentTarget.dataset.emoji : ''
  if (!emoji) return
  const input = `${page.data.input || ''}${emoji}`
  page.setData({ input, showSendBtn: true })
}

function onEmojiTab(page, e) {
  const tab = e && e.currentTarget ? e.currentTarget.dataset.tab : 'default'
  page.setData({ emojiTab: tab === 'custom' ? 'custom' : 'default' })
}

async function onAddCustomEmojiAlbum(page) {
  try {
    const path = await emojiMod.chooseImageForEmoji()
    await emojiMod.addCustomEmojiFromPath(path)
    refreshCustomEmojis(page)
    page.setData({ emojiTab: 'custom' })
    wx.showToast({ title: '已添加', icon: 'success' })
  } catch (err) {
    if (String(err.message || err) !== 'cancel') {
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  }
}

function onLongPressCustomEmoji(page, e) {
  const id = e && e.currentTarget ? e.currentTarget.dataset.id : ''
  if (!id) return
  wx.showActionSheet({
    itemList: ['删除表情'],
    success: (res) => {
      if (res.tapIndex === 0) {
        emojiMod.removeCustomEmoji(id)
        refreshCustomEmojis(page)
      }
    },
  })
}

async function onCollectImageAsEmoji(page, url) {
  wx.showLoading({ title: '收藏中…', mask: true })
  try {
    await emojiMod.addCustomEmojiFromPath(url)
    refreshCustomEmojis(page)
    wx.showToast({ title: '已添加到表情', icon: 'success' })
  } catch (_) {
    wx.showToast({ title: '收藏失败', icon: 'none' })
  } finally {
    wx.hideLoading()
  }
}

function onImageLongPress(page, e) {
  const url = e && e.currentTarget ? e.currentTarget.dataset.url : ''
  if (!url) return
  wx.showActionSheet({
    itemList: ['添加到表情', '预览图片'],
    success: (res) => {
      if (res.tapIndex === 0) void onCollectImageAsEmoji(page, url)
      else if (res.tapIndex === 1) wx.previewImage({ urls: [url], current: url })
    },
  })
}

function guessContentType(filePath, fallback) {
  const p = String(filePath || '').toLowerCase()
  if (/\.mp4$/.test(p)) return 'video/mp4'
  if (/\.mp3$/.test(p)) return 'audio/mpeg'
  if (/\.png$/.test(p)) return 'image/png'
  if (/\.webp$/.test(p)) return 'image/webp'
  return fallback || 'application/octet-stream'
}

function uploadViaGroupChat(filePath, contentType, fileName) {
  return groupChatApi.uploadMedia(filePath, contentType, fileName)
}

function chooseAlbumImage() {
  return mpPrivacy
    .runChooseMedia(
      {
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
      },
      { purpose: '发送聊天图片' },
    )
    .then((res) => {
      if (!res) return Promise.reject(new Error('cancel'))
      const file = res.tempFiles && res.tempFiles[0]
      if (!file || !file.tempFilePath) return Promise.reject(new Error('cancel'))
      return { filePath: file.tempFilePath, contentType: 'image/jpeg', kind: 'image' }
    })
}

function takePhoto() {
  return mpPrivacy
    .runChooseMedia(
      {
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
      },
      { purpose: '聊天拍照发送', needCamera: true },
    )
    .then((res) => {
      if (!res) return Promise.reject(new Error('cancel'))
      const file = res.tempFiles && res.tempFiles[0]
      if (!file || !file.tempFilePath) return Promise.reject(new Error('cancel'))
      return { filePath: file.tempFilePath, contentType: 'image/jpeg', kind: 'image' }
    })
}

function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: (res) => {
        resolve({
          kind: 'location',
          latitude: res.latitude,
          longitude: res.longitude,
          locationName: String(res.name || res.address || '位置').trim(),
          text: String(res.address || res.name || '').trim(),
        })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function chooseFile() {
  return mpPrivacy.prepareFilePick().then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 1,
          type: 'file',
          success: (res) => {
            const file = res.tempFiles && res.tempFiles[0]
            if (!file || !file.path) {
              reject(new Error('cancel'))
              return
            }
            resolve({
              kind: 'file',
              filePath: file.path,
              fileName: file.name || '文件',
              contentType: guessContentType(file.path, file.type || 'application/octet-stream'),
            })
          },
          fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
        })
      }),
  )
}

function createRecorderManager(page) {
  const recorder = wx.getRecorderManager()
  recorder.onStop((res) => {
    if (page._voiceReject) {
      page._voiceReject = false
      return
    }
    const path = res.tempFilePath
    const durationSec = Math.max(1, Math.round((res.duration || 0) / 1000))
    if (path && typeof page.onVoiceRecorded === 'function') {
      page.onVoiceRecorded({ filePath: path, durationSec })
    }
  })
  recorder.onError(() => {
    wx.showToast({ title: '录音失败', icon: 'none' })
    if (page.setData) page.setData({ recordingVoice: false })
  })
  return recorder
}

function startVoiceRecord(page, recorder) {
  if (!recorder) return
  page._voiceReject = false
  page.setData({ recordingVoice: true })
  recorder.start({
    duration: 60000,
    format: 'mp3',
    sampleRate: 16000,
    numberOfChannels: 1,
  })
}

function stopVoiceRecord(page, recorder, cancel) {
  if (!recorder) return
  page._voiceReject = !!cancel
  page.setData({ recordingVoice: false })
  recorder.stop()
}

module.exports = {
  PLUS_ACTIONS,
  composerPanelData,
  refreshCustomEmojis,
  filterMentionMembers,
  resolveMentionKeys,
  syncFilteredMentionMembers,
  onComposerInput,
  onTogglePlus,
  onToggleEmoji,
  onToggleVoiceMode,
  onOpenMentionPanel,
  onCloseMentionPanel,
  onMentionSearch,
  onPickMentionMember,
  onPickDefaultEmoji,
  onEmojiTab,
  onAddCustomEmojiAlbum,
  onLongPressCustomEmoji,
  onCollectImageAsEmoji,
  onImageLongPress,
  chooseAlbumImage,
  takePhoto,
  chooseLocation,
  chooseFile,
  uploadViaGroupChat,
  guessContentType,
  createRecorderManager,
  startVoiceRecord,
  stopVoiceRecord,
}
