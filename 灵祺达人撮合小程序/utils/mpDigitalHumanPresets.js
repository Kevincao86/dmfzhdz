/** 与商家 ERP merchantStaticUrl 同源 OSS（根域 /digital-human 曾 500，勿再走 mofangdianai.com） */
const AVATAR_CDN =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/web-static/merchant/digital-human/avatars'
/** 换图后递增，破小程序/CDN 缓存 */
const AVATAR_ASSET_VERSION = 'dh20260715b'

const VOICE_TUNING = {
  'av-real-1': { rate: 0.94, pitch: 0.96, cloudVoiceId: 'Chinese (Mandarin)_Reliable_Executive' },
  'av-real-2': { rate: 1.0, pitch: 1.02, cloudVoiceId: 'Chinese (Mandarin)_Warm_Girl' },
  'av-real-3': { rate: 0.92, pitch: 0.94, cloudVoiceId: 'Chinese (Mandarin)_News_Anchor' },
  'av-real-4': { rate: 1.02, pitch: 1.03, cloudVoiceId: 'Chinese (Mandarin)_Sweet_Lady' },
  'av-real-5': { rate: 1.04, pitch: 0.98, cloudVoiceId: 'Chinese (Mandarin)_Unrestrained_Young_Man' },
  'av-real-6': { rate: 0.98, pitch: 1.02, cloudVoiceId: 'Chinese (Mandarin)_Mature_Woman' },
  'av-real-7': { rate: 0.93, pitch: 0.95, cloudVoiceId: 'Chinese (Mandarin)_Sincere_Adult' },
  'av-real-8': { rate: 1.05, pitch: 1.04, cloudVoiceId: 'Chinese (Mandarin)_Crisp_Girl' },
  'av-real-9': { rate: 1.05, pitch: 0.99, cloudVoiceId: 'Chinese (Mandarin)_Southern_Young_Man' },
  'av-real-10': { rate: 0.96, pitch: 1.04, cloudVoiceId: 'Chinese (Mandarin)_Soft_Girl' },
  'av-real-11': { rate: 1.03, pitch: 0.97, cloudVoiceId: 'Chinese (Mandarin)_Male_Announcer' },
  'av-real-12': { rate: 0.98, pitch: 1.03, cloudVoiceId: 'Chinese (Mandarin)_IntellectualGirl' },
}

const REAL_AVATARS = [
  { id: 'av-real-1', name: '晓晨', tag: '商务男声', gender: '男', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-2', name: '悦然', tag: '亲和女声', gender: '女', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-3', name: '明哲', tag: '新闻播报', gender: '男', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-4', name: '诗涵', tag: '种草达人', gender: '女', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-5', name: '俊杰', tag: '阳光男声', gender: '男', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-6', name: '婉清', tag: '门店店长', gender: '女', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-7', name: '浩然', tag: '沉稳讲解', gender: '男', style: 'realistic', bodyFrame: 'full' },
  { id: 'av-real-8', name: '语桐', tag: '活力女声', gender: '女', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-9', name: '子轩', tag: '青年男声', gender: '男', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-10', name: '思琪', tag: '温柔女声', gender: '女', style: 'realistic', bodyFrame: 'half' },
  { id: 'av-real-11', name: '建国', tag: '播报男声', gender: '男', style: 'realistic', bodyFrame: 'full' },
  { id: 'av-real-12', name: '书瑶', tag: '知性女声', gender: '女', style: 'realistic', bodyFrame: 'half' },
]

const CARTOON_AVATARS = [
  { id: 'cartoon-1', name: '小祺', tag: '卡通 IP', gender: '女', style: 'cartoon', bodyFrame: 'half' },
  { id: 'cartoon-2', name: '阿灵', tag: '种草达人', gender: '女', style: 'cartoon', bodyFrame: 'half' },
  { id: 'cartoon-3', name: '团子', tag: '萌系讲解', gender: '女', style: 'cartoon', bodyFrame: 'half' },
]

const PRESET_AVATARS = [...REAL_AVATARS, ...CARTOON_AVATARS].map((a) => ({
  ...a,
  previewUrl: `${AVATAR_CDN}/${a.id}.jpg?v=${AVATAR_ASSET_VERSION}`,
  voicePresetId: `v-${a.id}`,
  voiceLabel: `${a.name} · ${a.tag}`,
  custom: false,
}))

const CUSTOM_AVATARS_KEY = 'meoo_mp_digital_human_custom_avatars_v1'
const TTS_PREVIEW_SAMPLE = '大家好，我是您的数字人主播，这是一段音色试听。'

const BACKGROUNDS = [
  { id: 'studio', label: '演播室' },
  { id: 'store', label: '门店实景' },
  { id: 'green', label: '绿幕' },
  { id: 'solid-blue', label: '品牌蓝' },
]

const GESTURES = [
  { id: 'none', label: '无手势' },
  { id: 'emphasis', label: '强调' },
  { id: 'point', label: '指向' },
  { id: 'welcome', label: '欢迎' },
]

const SUBTITLE_STYLES = [
  { id: 'bottom-white', label: '底部白字' },
  { id: 'bottom-yellow', label: '底部黄字' },
  { id: 'top-minimal', label: '顶部简约' },
]

const WIZARD_STEPS = [
  { n: 1, label: '选择形象' },
  { n: 2, label: '创作内容' },
  { n: 3, label: '配置参数' },
  { n: 4, label: '预览确认' },
  { n: 5, label: '提交合成' },
]

const WORKS_KEY = 'meoo_mp_digital_human_works_v1'

function voiceForAvatar(avatarId) {
  const t = VOICE_TUNING[avatarId] || VOICE_TUNING['av-real-1']
  return {
    voicePresetId: `v-${avatarId}`,
    speechRate: t.rate,
    speechPitch: t.pitch,
    cloudVoiceId: t.cloudVoiceId,
  }
}

/** 与星选 DigitalHumanBroadcastPage VOICE_PRESETS 对齐的可选项 */
const CUSTOM_VOICE_OPTIONS = [
  {
    id: 'v-custom-female',
    label: '自定义形象 · 亲和女声',
    gender: '女',
    speechRate: 1,
    speechPitch: 1.02,
    cloudVoiceId: 'Chinese (Mandarin)_Warm_Girl',
  },
  {
    id: 'v-custom-male',
    label: '自定义形象 · 稳重男声',
    gender: '男',
    speechRate: 0.94,
    speechPitch: 0.96,
    cloudVoiceId: 'Chinese (Mandarin)_Reliable_Executive',
  },
]

const AVATAR_VOICE_OPTIONS = PRESET_AVATARS.map((a) => {
  const t = VOICE_TUNING[a.id] || { rate: 1, pitch: 1, cloudVoiceId: 'Chinese (Mandarin)_Warm_Girl' }
  return {
    id: `v-${a.id}`,
    label: `${a.name} · ${a.tag}`,
    gender: a.gender,
    avatarId: a.id,
    speechRate: t.rate,
    speechPitch: t.pitch,
    cloudVoiceId: t.cloudVoiceId,
  }
})

const ALL_VOICE_OPTIONS = [...AVATAR_VOICE_OPTIONS, ...CUSTOM_VOICE_OPTIONS]

function voiceOptionsForAvatar(avatarId) {
  const av = PRESET_AVATARS.find((a) => a.id === avatarId)
  const paired = AVATAR_VOICE_OPTIONS.find((v) => v.avatarId === avatarId)
  const sameGender = ALL_VOICE_OPTIONS.filter((v) => !av || v.gender === av.gender)
  const rest = ALL_VOICE_OPTIONS.filter((v) => !sameGender.includes(v))
  const ordered = []
  if (paired) ordered.push(paired)
  sameGender.forEach((v) => {
    if (!ordered.find((x) => x.id === v.id)) ordered.push(v)
  })
  rest.forEach((v) => {
    if (!ordered.find((x) => x.id === v.id)) ordered.push(v)
  })
  return ordered
}

function voiceById(voiceId, avatarId, customAvatar) {
  if (customAvatar && customAvatar.referenceAudioBase64) {
    return {
      voicePresetId: 'v-clone',
      speechRate: Number(customAvatar.speechRate) || 1,
      speechPitch: Number(customAvatar.speechPitch) || 1,
      label: customAvatar.voiceLabel || '我的音色',
      referenceAudioBase64: customAvatar.referenceAudioBase64,
    }
  }
  const hit = ALL_VOICE_OPTIONS.find((v) => v.id === voiceId)
  if (hit) {
    return {
      voicePresetId: hit.id,
      speechRate: hit.speechRate,
      speechPitch: hit.speechPitch,
      cloudVoiceId: hit.cloudVoiceId,
      label: hit.label,
    }
  }
  return { ...voiceForAvatar(avatarId), label: '默认音色' }
}

function loadCustomAvatars() {
  try {
    const raw = wx.getStorageSync(CUSTOM_AVATARS_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return []
    return list
      .filter((a) => a && a.id && a.previewUrl)
      .map((a) => ({
        ...a,
        custom: true,
        style: a.style || 'realistic',
        tag: a.tag || '自定义',
        voiceLabel: a.voiceLabel || '我的音色',
        voicePresetId: a.voicePresetId || 'v-clone',
      }))
  } catch (_) {
    return []
  }
}

function saveCustomAvatars(list) {
  wx.setStorageSync(CUSTOM_AVATARS_KEY, JSON.stringify((list || []).slice(0, 20)))
}

function upsertCustomAvatar(avatar) {
  const list = loadCustomAvatars().filter((a) => a.id !== avatar.id)
  list.unshift(avatar)
  saveCustomAvatars(list)
  return list
}

function allAvatars() {
  return [...loadCustomAvatars(), ...PRESET_AVATARS]
}

function findAvatar(avatarId) {
  return allAvatars().find((a) => a.id === avatarId) || PRESET_AVATARS[0]
}

function loadWorks() {
  try {
    const raw = wx.getStorageSync(WORKS_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch (_) {
    return []
  }
}

function saveWorks(list) {
  wx.setStorageSync(WORKS_KEY, JSON.stringify((list || []).slice(0, 30)))
}

function upsertWork(work) {
  const list = loadWorks().filter((w) => w.id !== work.id)
  list.unshift(work)
  saveWorks(list)
  return list
}

module.exports = {
  PRESET_AVATARS,
  BACKGROUNDS,
  GESTURES,
  SUBTITLE_STYLES,
  WIZARD_STEPS,
  ALL_VOICE_OPTIONS,
  TTS_PREVIEW_SAMPLE,
  voiceForAvatar,
  voiceOptionsForAvatar,
  voiceById,
  loadCustomAvatars,
  upsertCustomAvatar,
  allAvatars,
  findAvatar,
  loadWorks,
  upsertWork,
}
