import { resolveStoreSceneBackgroundDataUrl, storeScenePrompt, type StoreSceneId } from './digitalHumanStoreScenes.js'
import { findUserSavedAvatar, isUserSavedAvatarId } from './digitalHumanUserAvatars.js'
import {
  deleteWorkCustomAvatar,
  deleteWorkCustomAudio,
  deleteWorkCustomBackground,
  deleteWorkMp4Blob,
  deleteWorkProductImage,
  deleteWorkVoiceCloneSample,
  loadWorkCustomAvatar,
  loadWorkCustomAudio,
  loadWorkCustomBackground,
  loadWorkProductImage,
  saveWorkCustomAvatar,
  saveWorkCustomAudio,
  saveWorkCustomBackground,
  saveWorkProductImage,
  saveWorkVoiceCloneSample,
  saveWorkReferenceVideo,
  loadWorkVoiceCloneSample,
  deleteWorkReferenceVideo,
} from './digitalHumanWorkBlobStore.js'
import { merchantStaticUrl, webStaticCandidates } from './webStaticOssAssets.js'

export type AvatarKind = 'preset' | 'photo' | 'video_clone'
export type AvatarStyle = 'realistic' | 'cartoon'
export type FrameMode = 'full' | 'half'
export type AvatarNationality = 'cn' | 'intl'
export type DriveMode = 'text' | 'audio' | 'link'
export type Resolution = '720P' | '480P'
export type S2vOutputResolution = '720P' | '480P'
export type WorkStatus = 'draft' | 'queued' | 'rendering' | 'completed' | 'failed'

export type PresetAvatar = {
  id: string
  name: string
  style: AvatarStyle
  tag: string
  gradient: string
  /** 公开预览图（本地 JPG 缩略图或 DiceBear 卡通头像） */
  previewUrl: string
  gender: '男' | '女'
  /** 预置构图：半身 / 全身（与站位默认一致） */
  bodyFrame: FrameMode
  /** 人种标签：中国人 / 外国人 */
  nationality: AvatarNationality
}

export function avatarBodyFrameLabel(frame: FrameMode): string {
  return frame === 'full' ? '全身' : '半身'
}

export function avatarNationalityLabel(nationality: AvatarNationality): string {
  return nationality === 'intl' ? '外国人' : '中国人'
}

export function avatarCatalogTags(av: PresetAvatar): string {
  if (av.style === 'cartoon') return `卡通 · ${av.tag}`
  return `${avatarBodyFrameLabel(av.bodyFrame)} · ${avatarNationalityLabel(av.nationality)} · ${av.tag}`
}

export type VoicePreset = {
  id: string
  label: string
  gender: '男' | '女'
  /** 身份类型，与形象 tag 一致 */
  persona: string
  /** 绑定的形象 id；克隆音色等通用项为空 */
  avatarId?: string
  dialect?: string
  rate: number
  pitch: number
  /** 浏览器 TTS 在同性别语音池中的分散索引（0–20） */
  voiceIndex: number
  /** MiniMax 等云端 TTS 系统音色 id（与形象性别/人设一一对应） */
  cloudVoiceId?: string
}

export type DigitalHumanDraft = {
  avatarId: string | null
  customAvatarDataUrl: string | null
  avatarKind: AvatarKind
  outfit: string
  hairstyle: string
  background: string
  /** 门店实景子场景 */
  storeScene?: StoreSceneId | null
  /** 自定义背景图文件名（数据在 IndexedDB） */
  customBackgroundFileName: string | null
  frameMode: FrameMode
  resolution: Resolution
  driveMode: DriveMode
  script: string
  /** 链接驱动：抖音分享 URL */
  douyinLinkUrl: string
  /** 链接驱动 / 翻拍：分镜动作指令 */
  motionInstructions: string
  audioFileName: string | null
  /** 实拍参考视频文件名（MP4 存 IndexedDB） */
  customReferenceVideoFileName: string | null
  /** 语音克隆样本文件名（音频在 IndexedDB） */
  voiceCloneFileName: string | null
  voiceId: string
  speechRate: number
  speechPitch: number
  subtitleEnabled: boolean
  subtitleStyle: string
  /** 手持产品：自动抠图 + Seedance 双参考 AI 视频融合（非成片 ffmpeg 叠加） */
  productOverlayEnabled: boolean
  productImageFileName: string | null
  greenScreen: boolean
  gesturePreset: string
  multiScene: boolean
  /** 多场景拼接：每段口播对应一个镜头背景（至少 2 项） */
  sceneShots: DhSceneShot[]
}

export type DhSceneShot = {
  id: string
  label: string
  background: string
  storeScene?: StoreSceneId | null
}

export function newSceneShot(label: string, seed?: Partial<Omit<DhSceneShot, 'id' | 'label'>>): DhSceneShot {
  return {
    id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    background: 'studio',
    storeScene: null,
    ...seed,
  }
}

/** 将镜头配置合并进 draft（用于分段生成） */
export function draftForSceneShot(draft: DigitalHumanDraft, shot: DhSceneShot): DigitalHumanDraft {
  return {
    ...draft,
    background: shot.background,
    storeScene: shot.background === 'store' ? shot.storeScene ?? null : null,
    greenScreen: shot.background === 'green',
  }
}

export type DigitalHumanWork = {
  id: string
  title: string
  status: WorkStatus
  progress: number
  createdAt: string
  updatedAt: string
  draft: DigitalHumanDraft
  previewNote?: string
  errorMessage?: string
  /** 远端 HTTPS 成片地址（若有 OSS 上传） */
  outputMp4Url?: string
  /** 本会话 object URL（不写入 localStorage，刷新后从 IndexedDB 恢复） */
  outputBlobUrl?: string
  /** 成片已写入 IndexedDB，可离线预览/下载 */
  hasLocalMp4?: boolean
  /** 自定义人像在 IndexedDB（draft.customAvatarDataUrl 不写入 localStorage） */
  hasLocalCustomAvatar?: boolean
  /** 用户上传口播音频在 IndexedDB（音频驱动模式） */
  hasLocalCustomAudio?: boolean
  /** 产品图在 IndexedDB */
  hasLocalProductImage?: boolean
  /** 自定义背景图在 IndexedDB */
  hasLocalCustomBackground?: boolean
  /** 语音克隆样本在 IndexedDB */
  hasLocalVoiceCloneSample?: boolean
  /** 用户上传实拍参考视频在 IndexedDB */
  hasLocalReferenceVideo?: boolean
  videoEngine?:
    | 'omnihuman'
    | 'motion_imitate'
    | 'qwen_s2v'
    | 'seedance'
    | 'seedance_lipsync'
    | 'seedance_product_fusion'
    | 'kling'
  plannerModel?: 'doubao' | 'qwen'
  segmentCount?: number
}

/** 预置 JPG 换图后递增，破 cs 上 /digital-human/avatars 7 天缓存 */
export const PRESET_AVATAR_ASSET_VERSION = 'dh20260822'

/** 同源优先，避免 OSS Content-Disposition:attachment 导致 fetch Failed to fetch */
export function presetAvatarPreviewCandidates(file: string): string[] {
  const path = `/digital-human/avatars/${file}`
  const candidates = webStaticCandidates('merchant', path)
  return [...candidates]
    .map((u) => (u.startsWith('/') ? `${u.split('?')[0]}?v=${PRESET_AVATAR_ASSET_VERSION}` : u))
    .sort((a, b) => {
      const aLocal = a.startsWith('/') ? 0 : 1
      const bLocal = b.startsWith('/') ? 0 : 1
      return aLocal - bLocal
    })
}

export function presetAvatarPreviewUrl(file: string): string {
  return presetAvatarPreviewCandidates(file)[0] || merchantStaticUrl(`/digital-human/avatars/${file}`)
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'av-real-1',
    name: '晓晨',
    style: 'realistic',
    tag: '餐饮店长',
    gender: '男',
    gradient: 'from-slate-600 to-slate-800',
    previewUrl: presetAvatarPreviewUrl('av-real-1.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'av-real-2',
    name: '悦然',
    style: 'realistic',
    tag: '门店店长',
    gender: '女',
    gradient: 'from-rose-400 to-orange-400',
    previewUrl: presetAvatarPreviewUrl('av-real-2.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'av-real-3',
    name: '明哲',
    style: 'realistic',
    tag: '团购讲解',
    gender: '男',
    gradient: 'from-blue-600 to-indigo-700',
    previewUrl: presetAvatarPreviewUrl('av-real-3.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'av-real-4',
    name: '诗涵',
    style: 'realistic',
    tag: '探店达人',
    gender: '女',
    gradient: 'from-pink-500 to-rose-500',
    previewUrl: presetAvatarPreviewUrl('av-real-4.jpg'),
    bodyFrame: 'half',
    nationality: 'intl',
  },
  {
    id: 'av-real-5',
    name: '俊杰',
    style: 'realistic',
    tag: '健身教练',
    gender: '男',
    gradient: 'from-sky-500 to-blue-600',
    previewUrl: presetAvatarPreviewUrl('av-real-5.jpg'),
    bodyFrame: 'half',
    nationality: 'intl',
  },
  {
    id: 'av-real-6',
    name: '婉清',
    style: 'realistic',
    tag: '美业顾问',
    gender: '女',
    gradient: 'from-teal-500 to-emerald-600',
    previewUrl: presetAvatarPreviewUrl('av-real-6.jpg'),
    bodyFrame: 'half',
    nationality: 'intl',
  },
  {
    id: 'av-real-7',
    name: '浩然',
    style: 'realistic',
    tag: '酒店接待',
    gender: '男',
    gradient: 'from-zinc-600 to-stone-700',
    previewUrl: presetAvatarPreviewUrl('av-real-7.jpg'),
    bodyFrame: 'full',
    nationality: 'cn',
  },
  {
    id: 'av-real-8',
    name: '思琪',
    style: 'realistic',
    tag: '茶饮店员',
    gender: '女',
    gradient: 'from-fuchsia-500 to-purple-600',
    previewUrl: presetAvatarPreviewUrl('av-real-8.jpg'),
    bodyFrame: 'full',
    nationality: 'cn',
  },
  {
    id: 'av-real-9',
    name: '子墨',
    style: 'realistic',
    tag: '烧烤档口',
    gender: '男',
    gradient: 'from-amber-600 to-orange-700',
    previewUrl: presetAvatarPreviewUrl('av-real-9.jpg'),
    bodyFrame: 'full',
    nationality: 'cn',
  },
  {
    id: 'av-real-10',
    name: '静雯',
    style: 'realistic',
    tag: '到综前台',
    gender: '女',
    gradient: 'from-indigo-400 to-violet-500',
    previewUrl: presetAvatarPreviewUrl('av-real-10.jpg'),
    bodyFrame: 'full',
    nationality: 'intl',
  },
  {
    id: 'av-real-11',
    name: '嘉伟',
    style: 'realistic',
    tag: '火锅店长',
    gender: '男',
    gradient: 'from-cyan-600 to-blue-700',
    previewUrl: presetAvatarPreviewUrl('av-real-11.jpg'),
    bodyFrame: 'full',
    nationality: 'intl',
  },
  {
    id: 'av-real-12',
    name: '雨桐',
    style: 'realistic',
    tag: '美甲师',
    gender: '女',
    gradient: 'from-rose-500 to-pink-600',
    previewUrl: presetAvatarPreviewUrl('av-real-12.jpg'),
    bodyFrame: 'full',
    nationality: 'intl',
  },
  {
    id: 'cartoon-1',
    name: '小祺',
    style: 'cartoon',
    tag: '门店 IP',
    gender: '女',
    gradient: 'from-cyan-400 to-teal-500',
    previewUrl: presetAvatarPreviewUrl('cartoon-1.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-2',
    name: '阿灵',
    style: 'cartoon',
    tag: '探店达人',
    gender: '女',
    gradient: 'from-violet-400 to-fuchsia-500',
    previewUrl: presetAvatarPreviewUrl('cartoon-2.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-3',
    name: '团子',
    style: 'cartoon',
    tag: '茶饮导购',
    gender: '女',
    gradient: 'from-amber-300 to-orange-400',
    previewUrl: presetAvatarPreviewUrl('cartoon-3.jpg'),
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-4',
    name: '小魔',
    style: 'cartoon',
    tag: '魔法导购',
    gender: '男',
    gradient: 'from-purple-500 to-indigo-600',
    previewUrl: 'https://api.dicebear.com/7.x/adventurer/png?seed=XiaoMo&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-5',
    name: '星星',
    style: 'cartoon',
    tag: '少儿科普',
    gender: '女',
    gradient: 'from-yellow-400 to-amber-500',
    previewUrl: 'https://api.dicebear.com/7.x/big-smile/png?seed=StarStar&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-6',
    name: '毛豆',
    style: 'cartoon',
    tag: '搞笑吐槽',
    gender: '男',
    gradient: 'from-lime-400 to-green-500',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=MaoDou&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-7',
    name: '糖糖',
    style: 'cartoon',
    tag: '甜品探店',
    gender: '女',
    gradient: 'from-pink-400 to-rose-400',
    previewUrl: 'https://api.dicebear.com/7.x/micah/png?seed=TangTang&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-8',
    name: '阿橙',
    style: 'cartoon',
    tag: '活力男声',
    gender: '男',
    gradient: 'from-orange-400 to-red-500',
    previewUrl: 'https://api.dicebear.com/7.x/personas/png?seed=A-Cheng&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
  {
    id: 'cartoon-9',
    name: '乐活',
    style: 'cartoon',
    tag: '本地生活',
    gender: '女',
    gradient: 'from-emerald-400 to-teal-500',
    previewUrl: 'https://api.dicebear.com/7.x/notionists/png?seed=LeHuo&size=256',
    bodyFrame: 'half',
    nationality: 'cn',
  },
]

/** 21 个形象 → MiniMax 中文系统音色（性别与 persona 对齐，21 套互不重复） */
const AVATAR_CLOUD_VOICE_IDS: Record<string, string> = {
  'av-real-1': 'Chinese (Mandarin)_Reliable_Executive',
  'av-real-2': 'Chinese (Mandarin)_Warm_Girl',
  'av-real-3': 'Chinese (Mandarin)_News_Anchor',
  'av-real-4': 'Chinese (Mandarin)_Sweet_Lady',
  'av-real-5': 'Chinese (Mandarin)_Unrestrained_Young_Man',
  'av-real-6': 'Chinese (Mandarin)_Mature_Woman',
  'av-real-7': 'Chinese (Mandarin)_Sincere_Adult',
  'av-real-8': 'Chinese (Mandarin)_Crisp_Girl',
  'av-real-9': 'Chinese (Mandarin)_Southern_Young_Man',
  'av-real-10': 'Chinese (Mandarin)_Soft_Girl',
  'av-real-11': 'Chinese (Mandarin)_Male_Announcer',
  'av-real-12': 'Chinese (Mandarin)_IntellectualGirl',
  'cartoon-1': 'Chinese (Mandarin)_Warm-HeartedGirl',
  'cartoon-2': 'Chinese (Mandarin)_ExplorativeGirl',
  'cartoon-3': 'Chinese (Mandarin)_Laid_BackGirl',
  'cartoon-4': 'Chinese (Mandarin)_Pure-hearted_Boy',
  'cartoon-5': 'Chinese (Mandarin)_Wise_Women',
  'cartoon-6': 'Chinese (Mandarin)_Humorous_Elder',
  'cartoon-7': 'Chinese (Mandarin)_Warm_Bestie',
  'cartoon-8': 'Chinese (Mandarin)_Gentle_Youth',
  'cartoon-9': 'Chinese (Mandarin)_Warm-HeartedAunt',
}

/** 21 个形象各自独立的语速 / 音调微调（接近 1.0，避免机械感） */
const AVATAR_VOICE_TUNING: Record<string, { rate: number; pitch: number; dialect?: string }> = {
  'av-real-1': { rate: 0.94, pitch: 0.96 },
  'av-real-2': { rate: 1.0, pitch: 1.02 },
  'av-real-3': { rate: 0.92, pitch: 0.94 },
  'av-real-4': { rate: 1.02, pitch: 1.03 },
  'av-real-5': { rate: 1.04, pitch: 0.98 },
  'av-real-6': { rate: 0.98, pitch: 1.02 },
  'av-real-7': { rate: 0.93, pitch: 0.95 },
  'av-real-8': { rate: 1.05, pitch: 1.04 },
  'av-real-9': { rate: 1.05, pitch: 0.99 },
  'av-real-10': { rate: 0.96, pitch: 1.04 },
  'av-real-11': { rate: 1.03, pitch: 0.97 },
  'av-real-12': { rate: 0.98, pitch: 1.03 },
  'cartoon-1': { rate: 1.0, pitch: 1.05 },
  'cartoon-2': { rate: 1.02, pitch: 1.03 },
  'cartoon-3': { rate: 1.06, pitch: 1.06 },
  'cartoon-4': { rate: 1.04, pitch: 1.0 },
  'cartoon-5': { rate: 0.98, pitch: 1.06 },
  'cartoon-6': { rate: 1.06, pitch: 1.02 },
  'cartoon-7': { rate: 1.03, pitch: 1.04 },
  'cartoon-8': { rate: 1.04, pitch: 0.98 },
  'cartoon-9': { rate: 1.0, pitch: 1.02 },
}

/** 21 个形象 → 21 套专属音色（voiceIndex 在同性别池内递增，保证男女声分离） */
export const AVATAR_VOICE_PRESETS: VoicePreset[] = (() => {
  let maleVoiceIndex = 0
  let femaleVoiceIndex = 0
  return PRESET_AVATARS.map((av) => {
    const tune = AVATAR_VOICE_TUNING[av.id] ?? { rate: 1, pitch: 1 }
    const voiceIndex = av.gender === '男' ? maleVoiceIndex++ : femaleVoiceIndex++
    return {
      id: `v-${av.id}`,
      label: `${av.name} · ${av.tag}`,
      gender: av.gender,
      persona: av.tag,
      avatarId: av.id,
      dialect: tune.dialect,
      rate: tune.rate,
      pitch: tune.pitch,
      voiceIndex,
      cloudVoiceId: AVATAR_CLOUD_VOICE_IDS[av.id],
    }
  })
})()

const VOICE_CLONE_PRESET: VoicePreset = {
  id: 'v-clone',
  label: '我的克隆音色',
  gender: '女',
  persona: '克隆',
  rate: 1,
  pitch: 1,
  voiceIndex: 0,
}

/** 自定义上传形象可选的通用 TTS 音色（无预置形象时使用） */
export const CUSTOM_UPLOAD_VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'v-custom-female',
    label: '自定义形象 · 亲和女声',
    gender: '女',
    persona: '自定义',
    rate: 1,
    pitch: 1.02,
    voiceIndex: 0,
    cloudVoiceId: 'Chinese (Mandarin)_Warm_Girl',
  },
  {
    id: 'v-custom-male',
    label: '自定义形象 · 稳重男声',
    gender: '男',
    persona: '自定义',
    rate: 0.94,
    pitch: 0.96,
    voiceIndex: 0,
    cloudVoiceId: 'Chinese (Mandarin)_Reliable_Executive',
  },
]

/** AI混剪口播可选音色（与数字人口播同源，含语音克隆） */
export const ICE_MIX_VOICE_PRESETS: VoicePreset[] = [
  ...CUSTOM_UPLOAD_VOICE_PRESETS,
  ...AVATAR_VOICE_PRESETS,
  VOICE_CLONE_PRESET,
]

export const ICE_MIX_VOICE_DEFAULT_ID = CUSTOM_UPLOAD_VOICE_PRESETS[0]!.id

/** IMS 批量成片内置 TTS 女声池（仅作无 MiniMax/通义时的兜底，主路径走外部 TTS） */
const IMS_BATCH_FEMALE_VOICES = ['zhitian', 'zhijia', 'zhiyuan', 'zhimiao_emo', 'zhibei_emo'] as const
const IMS_BATCH_MALE_VOICES = ['zhilun', 'zhiru', 'zhinan', 'zhiqing', 'zhixiang'] as const

function buildImsBatchVoiceByPreset(): Record<string, string> {
  const map: Record<string, string> = {
    'v-custom-female': 'zhitian',
    'v-custom-male': 'zhilun',
    'v-av-real-8': 'zhitian',
  }
  let fi = 0
  let mi = 0
  for (const p of ICE_MIX_VOICE_PRESETS) {
    if (p.id === 'v-clone' || map[p.id]) continue
    if (p.gender === '男') {
      map[p.id] = IMS_BATCH_MALE_VOICES[mi % IMS_BATCH_MALE_VOICES.length]!
      mi += 1
    } else {
      map[p.id] = IMS_BATCH_FEMALE_VOICES[fi % IMS_BATCH_FEMALE_VOICES.length]!
      fi += 1
    }
  }
  return map
}

/** 智能一键成片 IMS SpeechConfig.Voice（全量预设 gender 锁定映射） */
const IMS_BATCH_VOICE_BY_PRESET = buildImsBatchVoiceByPreset()

/** 映射混剪口播音色 → IMS 批量成片 SpeechConfig.Voice（兜底路径） */
export function resolveImsBatchSpeechVoice(voicePresetId: string): string {
  const id = String(voicePresetId || ICE_MIX_VOICE_DEFAULT_ID).trim()
  const mapped = IMS_BATCH_VOICE_BY_PRESET[id]
  if (mapped) return mapped
  const preset = voicePresetById(id) ?? ICE_MIX_VOICE_PRESETS.find((v) => v.id === id)
  if (preset?.gender === '男') return IMS_BATCH_MALE_VOICES[0]
  if (preset?.gender === '女') return IMS_BATCH_FEMALE_VOICES[0]
  return IMS_BATCH_FEMALE_VOICES[0]
}

/** 全部可选音色：21 套形象专属 + 自定义通用 + 克隆 */
export const VOICE_PRESETS: VoicePreset[] = [
  ...AVATAR_VOICE_PRESETS,
  ...CUSTOM_UPLOAD_VOICE_PRESETS,
  VOICE_CLONE_PRESET,
]

export const BACKGROUND_OPTIONS = [
  { id: 'studio', label: '演播室' },
  { id: 'store', label: '门店实景' },
  { id: 'green', label: '绿幕（可换背景）' },
  { id: 'solid-blue', label: '纯色 · 品牌蓝' },
  { id: 'custom', label: '自定义图片/视频' },
]

/** 视频生成 prompt 中的中文场景描述（勿直接传 option id） */
export function backgroundPromptForDraft(draft: DigitalHumanDraft): string {
  switch (draft.background) {
    case 'studio':
      return '专业电视演播室背景，柔和灯光，干净简洁'
    case 'store':
      return storeScenePrompt(draft.storeScene) || '真实门店内景，餐饮或零售场景，自然光线，生活化氛围'
    case 'green':
      return '均匀打光的纯绿色绿幕背景，无杂色，便于后期抠像'
    case 'solid-blue':
      return '品牌蓝色纯色背景，简洁专业，适合口播短视频'
    case 'custom':
      return '与品牌一致的自定义室内场景，简洁明亮，突出人物'
    default: {
      const opt = BACKGROUND_OPTIONS.find((b) => b.id === draft.background)
      return opt?.label ?? '专业演播室背景'
    }
  }
}

/** 形象预览图多为演播室灰底；非演播室场景首段勿用参考图，避免 i2v 冲突导致生成失败 */
export function useAvatarReferenceForFirstSegment(draft: DigitalHumanDraft): boolean {
  return draft.background === 'studio'
}

export const GESTURE_PRESETS = [
  { id: 'none', label: '无手势' },
  { id: 'emphasis', label: '强调（缓慢推近）' },
  { id: 'point', label: '指向（横向引导）' },
  { id: 'welcome', label: '欢迎（缓慢拉远）' },
  { id: 'explain', label: '讲解（稳镜头微推）' },
  { id: 'nod', label: '点头（轻微上下）' },
  { id: 'thumbs', label: '点赞（轻快起伏）' },
  { id: 'celebrate', label: '庆祝（活力推拉）' },
]

/** 口播模板（对照剪映数字人：选品类模板 → 套动作/景别 → 只改店名） */
export type DhScriptTemplate = {
  id: string
  category: string
  label: string
  gesturePreset: string
  frameMode: FrameMode
  script: string
}

export const DH_SCRIPT_TEMPLATES: DhScriptTemplate[] = [
  {
    id: 'store-tour',
    category: '探店',
    label: '探店讲解',
    gesturePreset: 'welcome',
    frameMode: 'half',
    script:
      '欢迎来到【店名】。\n今天带你看三样：环境、出品，还有这周的招牌【招牌名】。\n先坐下来喝一口，再慢慢看。\n想了解套餐，点下面链接，到店报手机号就能核。',
  },
  {
    id: 'combo-sell',
    category: '带货',
    label: '套餐带货',
    gesturePreset: 'point',
    frameMode: 'half',
    script:
      '这套【套餐名】，就是为到店准备的。\n包含【主食】、【饮品】，还送一份【赠品】。\n原价【原价】，现在团购只要【现价】。\n点进去就能核，到店报手机号。',
  },
  {
    id: 'campaign',
    category: '活动',
    label: '活动预告',
    gesturePreset: 'celebrate',
    frameMode: 'half',
    script:
      '这周末【店名】有一场到店活动，位置有限。\n到店打卡，核销【套餐名】，还能参与抽奖。\n时间是【日期】【时段】，地址在【地址】。\n先把档期定下来，朋友圈也同步发一波。',
  },
  {
    id: 'closing',
    category: '复盘',
    label: '打烊复盘',
    gesturePreset: 'explain',
    frameMode: 'half',
    script:
      '今晚【店名】打烊，跟大家说一句。\n今天【招牌名】卖得最好，【套餐名】还剩几份。\n明天【时段】继续，想吃的提前团。\n到店报手机号就能核，我们门口见。',
  },
  {
    id: 'beauty',
    category: '美业',
    label: '美业种草',
    gesturePreset: 'welcome',
    frameMode: 'half',
    script:
      '今天这套，适合想改气色、又怕夸张的人。\n到店先沟通需求，再按你的脸型来做【项目名】。\n时长大约【时长】，做完就能出门。\n预约从下面链接进，到店报手机号。',
  },
  {
    id: 'reception',
    category: '到综',
    label: '到综接待',
    gesturePreset: 'nod',
    frameMode: 'full',
    script:
      '欢迎到【店名】。先核销，再入座。\n套餐包含【项目名】，时长【时长】，还送【赠品】。\n有过敏或禁忌提前跟老师说一声。\n核销报手机号，我们前台见。',
  },
]

export type DhShopFill = {
  storeName?: string
  offerName?: string
  price?: string
  address?: string
}

/** 把【店名】【套餐名】等占位换成商家填写的门店信息 */
export function fillDhScriptPlaceholders(script: string, fill: DhShopFill): string {
  const pairs: Array<[RegExp, string | undefined]> = [
    [/【店名】/g, fill.storeName],
    [/【套餐名】/g, fill.offerName],
    [/【招牌名】/g, fill.offerName],
    [/【项目名】/g, fill.offerName],
    [/【现价】/g, fill.price],
    [/【地址】/g, fill.address],
  ]
  let out = script
  for (const [re, raw] of pairs) {
    const v = raw?.trim()
    if (v) out = out.replace(re, v)
  }
  return out
}

const DH_SETUP_KEY = 'meoo_dh_broadcast_setup_v1'

export type DhBroadcastSetupSnapshot = {
  background: string
  gesturePreset: string
  subtitleEnabled: boolean
  subtitleStyle: string
  frameMode: FrameMode
}

export function loadDhBroadcastSetup(): DhBroadcastSetupSnapshot | null {
  try {
    const raw = localStorage.getItem(DH_SETUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DhBroadcastSetupSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function saveDhBroadcastSetup(draft: Pick<DigitalHumanDraft, keyof DhBroadcastSetupSnapshot>): void {
  try {
    const snap: DhBroadcastSetupSnapshot = {
      background: draft.background,
      gesturePreset: draft.gesturePreset,
      subtitleEnabled: draft.subtitleEnabled,
      subtitleStyle: draft.subtitleStyle,
      frameMode: draft.frameMode,
    }
    localStorage.setItem(DH_SETUP_KEY, JSON.stringify(snap))
  } catch {
    /* 存储满时忽略 */
  }
}

export const SUBTITLE_STYLES = [
  { id: 'bottom-safe', label: '底部安全区白字（推荐）' },
  { id: 'bottom-white', label: '底部白字黑边' },
  { id: 'bottom-white-large', label: '底部大白字' },
  { id: 'bottom-yellow', label: '底部黄字' },
  { id: 'bottom-pink', label: '底部粉字（种草）' },
  { id: 'bottom-green', label: '底部绿字（促销）' },
  { id: 'center-white', label: '居中白字' },
  { id: 'top-minimal', label: '顶部简约' },
  { id: 'top-news', label: '顶部新闻条' },
  { id: 'cinematic', label: '电影感小字' },
]

export function defaultDraft(): DigitalHumanDraft {
  const first = PRESET_AVATARS[0]
  const voice = first ? voiceSettingsForAvatar(first) : voiceSettingsForAvatar(PRESET_AVATARS[0]!)
  return {
    avatarId: first?.id ?? null,
    customAvatarDataUrl: null,
    avatarKind: 'preset',
    outfit: '商务正装',
    hairstyle: '默认',
    background: 'studio',
    storeScene: null,
    customBackgroundFileName: null,
    frameMode: 'half',
    resolution: '720P',
    driveMode: 'text',
    script: '',
    douyinLinkUrl: '',
    motionInstructions: '',
    audioFileName: null,
    customReferenceVideoFileName: null,
    voiceCloneFileName: null,
    voiceId: voice.voiceId,
    speechRate: voice.speechRate,
    speechPitch: voice.speechPitch,
    subtitleEnabled: true,
    subtitleStyle: 'bottom-safe',
    productOverlayEnabled: false,
    productImageFileName: null,
    greenScreen: false,
    gesturePreset: 'emphasis',
    multiScene: false,
    sceneShots: [],
  }
}

const WORKS_KEY = 'meoo_digital_human_works_v1'

let storageReadyPromise: Promise<void> | null = null

/** 页面加载 / 提交渲染前：迁移 base64 人像到 IndexedDB 并压缩 localStorage */
export function ensureDigitalHumanStorageReady(): Promise<void> {
  if (!storageReadyPromise) {
    storageReadyPromise = migrateDigitalHumanWorksStorage().catch(() => {
      /* 迁移失败不阻断提交，save 层仍有兜底 */
    })
  }
  return storageReadyPromise
}

if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
  void ensureDigitalHumanStorageReady()
}

/** 兼容旧草稿 1080p/4k → 千问实际支持的 720P/480P */
export function normalizeDraftResolution(raw: unknown): S2vOutputResolution {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
  if (v === '480P' || v === '480') return '480P'
  return '720P'
}

export function s2vResolutionFromDraft(draft: Pick<DigitalHumanDraft, 'resolution'>): S2vOutputResolution {
  return normalizeDraftResolution(draft.resolution)
}

export function resolutionLabel(res: S2vOutputResolution): string {
  return res === '480P' ? '480P（省算力）' : '720P（推荐高清）'
}

export function loadDigitalHumanWorks(): DigitalHumanWork[] {
  try {
    const raw = localStorage.getItem(WORKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DigitalHumanWork[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeDigitalHumanWorks(rows: DigitalHumanWork[]): DigitalHumanWork[] {
  return rows.map((row) => {
    const remote = row.outputMp4Url?.trim()
    const keepRemote = remote && /^https?:\/\//i.test(remote) ? remote : undefined
    const hasAvatar = Boolean(row.draft.customAvatarDataUrl?.trim()) || Boolean(row.hasLocalCustomAvatar)
    const hasAudio = Boolean(row.hasLocalCustomAudio)
    const hasProduct = Boolean(row.hasLocalProductImage)
    const hasCustomBg = Boolean(row.hasLocalCustomBackground)
    return {
      ...row,
      outputMp4Url: keepRemote,
      outputBlobUrl: undefined,
      hasLocalMp4: Boolean(row.hasLocalMp4),
      hasLocalCustomAvatar: hasAvatar,
      hasLocalCustomAudio: hasAudio,
      hasLocalProductImage: hasProduct,
      hasLocalCustomBackground: hasCustomBg,
      draft: {
        ...row.draft,
        customAvatarDataUrl: null,
      },
    }
  })
}

function isStorageQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false
  return e.name === 'QuotaExceededError' || e.code === 22
}

export function saveDigitalHumanWorks(rows: DigitalHumanWork[]): void {
  const payload = serializeDigitalHumanWorks(rows)
  const tryWrite = (list: DigitalHumanWork[]) => {
    localStorage.setItem(WORKS_KEY, JSON.stringify(list))
  }
  try {
    tryWrite(payload)
    return
  } catch (e) {
    if (!isStorageQuotaError(e)) throw e
  }
  // 配额满：先删掉旧 blob 再写入压缩版（同 key 缩容有时仍失败）
  try {
    localStorage.removeItem(WORKS_KEY)
    tryWrite(payload)
    return
  } catch (e) {
    if (!isStorageQuotaError(e)) throw e
  }
  // 丢弃最旧已完成作品 metadata 后重试
  const trimmed = payload.filter((w, i) => {
    if (i >= payload.length - 12) return true
    return w.status !== 'completed' && w.status !== 'failed'
  })
  try {
    localStorage.removeItem(WORKS_KEY)
    tryWrite(trimmed)
    return
  } catch (e) {
    if (!isStorageQuotaError(e)) throw e
  }
  // 最后兜底：只保留最近 5 条
  try {
    localStorage.removeItem(WORKS_KEY)
    tryWrite(payload.slice(0, 5))
  } catch (e) {
    if (isStorageQuotaError(e)) {
      throw new Error('浏览器存储已满，请在「作品管理」删除旧作品后重试')
    }
    throw e
  }
}

export function upsertDigitalHumanWork(row: DigitalHumanWork): void {
  const list = loadDigitalHumanWorks()
  const ix = list.findIndex((w) => w.id === row.id)
  if (ix >= 0) list[ix] = row
  else list.unshift(row)
  saveDigitalHumanWorks(list)
}

/** 写入作品：自定义人像/口播音频进 IndexedDB，metadata 进 localStorage */
export async function upsertDigitalHumanWorkAsync(
  row: DigitalHumanWork,
  opts?: {
    customAudioBlob?: Blob | null
    productImageDataUrl?: string | null
    customBackgroundDataUrl?: string | null
    voiceCloneBlob?: Blob | null
    referenceVideoBlob?: Blob | null
  },
): Promise<void> {
  const avatar = row.draft.customAvatarDataUrl?.trim()
  let stored = row
  if (avatar) {
    await saveWorkCustomAvatar(row.id, avatar)
    stored = {
      ...stored,
      hasLocalCustomAvatar: true,
      draft: { ...stored.draft, customAvatarDataUrl: null },
    }
  } else if (!row.hasLocalCustomAvatar) {
    await deleteWorkCustomAvatar(row.id)
  }

  const productImg = opts?.productImageDataUrl?.trim()
  if (productImg?.startsWith('data:image/')) {
    await saveWorkProductImage(row.id, productImg)
    stored = { ...stored, hasLocalProductImage: true }
  } else if (!row.draft.productOverlayEnabled) {
    await deleteWorkProductImage(row.id)
    stored = { ...stored, hasLocalProductImage: false }
  }

  if (opts?.customAudioBlob && opts.customAudioBlob.size >= 128) {
    await saveWorkCustomAudio(row.id, opts.customAudioBlob)
    stored = { ...stored, hasLocalCustomAudio: true }
  } else if (row.draft.driveMode !== 'audio' && !row.hasLocalCustomAudio) {
    await deleteWorkCustomAudio(row.id)
  }

  const customBg = opts?.customBackgroundDataUrl?.trim()
  const needsCustomBg =
    row.draft.background === 'custom' ||
    (row.draft.background === 'store' && row.draft.storeScene)
  if (needsCustomBg && customBg?.startsWith('data:image/')) {
    await saveWorkCustomBackground(row.id, customBg)
    stored = { ...stored, hasLocalCustomBackground: true }
  } else if (!needsCustomBg) {
    await deleteWorkCustomBackground(row.id)
    stored = { ...stored, hasLocalCustomBackground: false }
  }

  if (opts?.voiceCloneBlob && opts.voiceCloneBlob.size >= 128) {
    await saveWorkVoiceCloneSample(row.id, opts.voiceCloneBlob)
    stored = { ...stored, hasLocalVoiceCloneSample: true }
  } else if (row.draft.voiceId !== 'v-clone' && !row.hasLocalVoiceCloneSample) {
    await deleteWorkVoiceCloneSample(row.id)
    stored = { ...stored, hasLocalVoiceCloneSample: false }
  }

  if (opts?.referenceVideoBlob && opts.referenceVideoBlob.size >= 1024) {
    await saveWorkReferenceVideo(row.id, opts.referenceVideoBlob)
    stored = { ...stored, hasLocalReferenceVideo: true }
  } else if (row.draft.avatarKind !== 'video_clone' && !row.hasLocalReferenceVideo) {
    await deleteWorkReferenceVideo(row.id)
    stored = { ...stored, hasLocalReferenceVideo: false }
  }

  upsertDigitalHumanWork(stored)
}

/** 加载作品关联的产品图 data URL */
export async function loadWorkProductImageDataUrl(work: DigitalHumanWork): Promise<string | null> {
  if (!work.draft.productOverlayEnabled && !work.hasLocalProductImage) return null
  return loadWorkProductImage(work.id)
}

/** 加载作品关联的自定义背景图 data URL */
export async function loadWorkCustomBackgroundDataUrl(work: DigitalHumanWork): Promise<string | null> {
  const needsBg =
    work.draft.background === 'custom' ||
    (work.draft.background === 'store' && work.draft.storeScene) ||
    work.hasLocalCustomBackground
  if (!needsBg) return null
  const fromIdb = await loadWorkCustomBackground(work.id)
  if (fromIdb) return fromIdb
  if (work.draft.background === 'store' && work.draft.storeScene) {
    try {
      return await resolveStoreSceneBackgroundDataUrl(work.draft.storeScene)
    } catch {
      return null
    }
  }
  return null
}

/** 加载作品关联的语音克隆样本 */
export async function loadWorkVoiceCloneSampleBlob(work: DigitalHumanWork): Promise<Blob | null> {
  if (work.draft.voiceId !== 'v-clone' && !work.hasLocalVoiceCloneSample) return null
  return loadWorkVoiceCloneSample(work.id)
}

/** 渲染/编辑前恢复 draft 中的自定义人像 */
export async function hydrateDigitalHumanWork(work: DigitalHumanWork): Promise<DigitalHumanWork> {
  let draft = work.draft
  if (!draft.customAvatarDataUrl?.trim() && work.hasLocalCustomAvatar) {
    const avatar = await loadWorkCustomAvatar(work.id)
    if (avatar) draft = { ...draft, customAvatarDataUrl: avatar }
  }
  return draft === work.draft ? work : { ...work, draft }
}

/** 加载作品关联的上传口播音频 */
export async function loadWorkNarrationAudio(work: DigitalHumanWork): Promise<Blob | null> {
  if (work.draft.driveMode !== 'audio') return null
  return loadWorkCustomAudio(work.id)
}

/** 将旧版 localStorage 内嵌 base64 人像迁移到 IndexedDB（一次性） */
export async function migrateDigitalHumanWorksStorage(): Promise<void> {
  let raw: DigitalHumanWork[]
  try {
    const text = localStorage.getItem(WORKS_KEY)
    if (!text) return
    const parsed = JSON.parse(text) as DigitalHumanWork[]
    if (!Array.isArray(parsed)) return
    raw = parsed
  } catch {
    return
  }
  let changed = false
  const next: DigitalHumanWork[] = []
  for (const row of raw) {
    const avatar = row.draft.customAvatarDataUrl?.trim()
    if (avatar) {
      try {
        await saveWorkCustomAvatar(row.id, avatar)
        changed = true
        next.push({
          ...row,
          hasLocalCustomAvatar: true,
          draft: { ...row.draft, customAvatarDataUrl: null },
        })
        continue
      } catch {
        next.push(row)
        continue
      }
    }
    next.push(row)
  }
  if (changed) {
    try {
      saveDigitalHumanWorks(next)
    } catch {
      /* save 层会 removeItem + 压缩重试 */
      saveDigitalHumanWorks(next.slice(0, 8))
    }
  }
}

export function deleteDigitalHumanWork(id: string): void {
  saveDigitalHumanWorks(loadDigitalHumanWorks().filter((w) => w.id !== id))
  void deleteWorkMp4Blob(id)
  void deleteWorkCustomAvatar(id)
  void deleteWorkCustomAudio(id)
}

export function findPresetAvatarForDraft(draft: DigitalHumanDraft): PresetAvatar | null {
  if (!draft.avatarId) return null
  const user = findUserSavedAvatar(draft.avatarId)
  if (user) return user
  return PRESET_AVATARS.find((a) => a.id === draft.avatarId) ?? null
}

export function resolveVoiceForDraft(
  draft: DigitalHumanDraft,
  avatar: PresetAvatar | null,
): VoicePreset | undefined {
  const byId = voicePresetById(draft.voiceId)
  if (byId?.cloudVoiceId) return byId
  if (draft.voiceId === 'v-clone') {
    const fallback =
      CUSTOM_UPLOAD_VOICE_PRESETS.find((v) => v.gender === (byId?.gender ?? '女')) ??
      CUSTOM_UPLOAD_VOICE_PRESETS[0]
    return fallback
  }
  if (avatar) return matchVoicePresetForAvatar(avatar)
  if (!draft.avatarId && (draft.customAvatarDataUrl || draft.avatarKind !== 'preset')) {
    return (
      CUSTOM_UPLOAD_VOICE_PRESETS.find((v) => v.id === draft.voiceId) ?? CUSTOM_UPLOAD_VOICE_PRESETS[0]
    )
  }
  return undefined
}

export function workTitleFromDraft(d: DigitalHumanDraft): string {
  const line = d.script.trim().split(/\n/)[0]?.slice(0, 24)
  if (line) return line
  if (d.audioFileName) return d.audioFileName.replace(/\.[^.]+$/, '')
  const av = PRESET_AVATARS.find((a) => a.id === d.avatarId)
  return av ? `${av.name} · 口播` : '未命名口播'
}

/** 形象侧栏预览：无口播文案时使用各角色的默认试听台词 */
export function avatarDemoScript(avatar: PresetAvatar): string {
  const byId: Record<string, string> = {
    'av-real-1':
      '大家好，我是晓晨。今天带你看我们店的招牌套餐，点链接团购，到店报手机号就能核。',
    'av-real-2':
      '嗨，我是悦然。这条带你看店里环境、出品和本周活动，到店报手机号核销就行。',
    'av-real-3':
      '各位好，我是明哲。今天团购包含主食和饮品，价格以链接为准，到店报手机号核销。',
    'av-real-4':
      '哈喽我是诗涵。这家店环境稳、出品稳，人均看团购价，到店报手机号就能核。',
    'av-real-5':
      '嘿，我是俊杰。私教体验课在团购里，到店报手机号核销，先练再决定办不办卡。',
    'av-real-6':
      '您好，我是婉清。项目先沟通再按你的需求做，预约从团购进，到店报手机号。',
    'av-real-7':
      '大家好，我是浩然。房型与早餐以套餐为准，预订后到店报手机号办理入住。',
    'av-real-8':
      '哈喽，我是思琪。新品茶饮在团购里，到店报手机号核销，少排队。',
    'av-real-9':
      '我是子墨。摊位必点看团购套餐，到店报手机号就能核，别买错份。',
    'av-real-10':
      '您好，我是静雯。先核销再入座，套餐含项目时长，到店报手机号。',
    'av-real-11':
      '家人们，我是嘉伟。锅底和小料都在套餐里，团购价点链接，到店报手机号。',
    'av-real-12':
      'Hi，我是雨桐。美甲款式到店选，时长看套餐，预约后报手机号核销。',
  }
  if (byId[avatar.id]) return byId[avatar.id]
  if (avatar.style === 'cartoon') {
    return `嗨，我是${avatar.name}，${avatar.tag}。一起发现本地生活好店好货，记得关注我哦。`
  }
  return `您好，我是${avatar.name}，${avatar.tag}。欢迎了解我们的精选团购与到店优惠。`
}

export function resolveDigitalHumanPreviewScript(draft: DigitalHumanDraft, avatar: PresetAvatar | null): string {
  const custom = draft.script.trim()
  if (custom.length >= 8) return custom
  if (avatar) return avatarDemoScript(avatar)
  return '您好，欢迎了解我们的本地生活精选内容。完成口播文案后，可生成更贴合的动态预览。'
}

/** 用户保存形象上绑定的音色（含语速/音调） */
export function savedVoiceBindingForAvatar(
  avatar: PresetAvatar & Partial<{ voiceId?: string; speechRate?: number; speechPitch?: number }>,
): Pick<DigitalHumanDraft, 'voiceId' | 'speechRate' | 'speechPitch'> | null {
  if (!isUserSavedAvatarId(avatar.id)) return null
  const voiceId = String(avatar.voiceId ?? '').trim()
  if (!voiceId) {
    const fallback =
      CUSTOM_UPLOAD_VOICE_PRESETS.find((v) => v.gender === avatar.gender) ?? CUSTOM_UPLOAD_VOICE_PRESETS[0]!
    return { voiceId: fallback.id, speechRate: fallback.rate, speechPitch: fallback.pitch }
  }
  const preset = voicePresetById(voiceId)
  if (!preset) return null
  return {
    voiceId,
    speechRate: avatar.speechRate ?? preset.rate,
    speechPitch: avatar.speechPitch ?? preset.pitch,
  }
}

/** 按形象 id 取专属音色（21 套一对一；用户形象读保存的 voiceId） */
export function matchVoicePresetForAvatar(
  avatar: PresetAvatar & Partial<{ voiceId?: string; speechRate?: number; speechPitch?: number }>,
): VoicePreset {
  if (isUserSavedAvatarId(avatar.id)) {
    const binding = savedVoiceBindingForAvatar(avatar)
    if (binding) {
      const preset = voicePresetById(binding.voiceId)
      if (preset) return preset
    }
  }
  return AVATAR_VOICE_PRESETS.find((v) => v.avatarId === avatar.id) ?? AVATAR_VOICE_PRESETS[0]!
}

export function voicePresetById(voiceId: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((v) => v.id === voiceId)
}

/** 当前形象可选音色：专属音色 + 克隆（用户形象保留保存音色 + 克隆） */
export function voiceOptionsForAvatar(avatar: PresetAvatar | null): VoicePreset[] {
  if (!avatar) return voiceOptionsForCustomAvatar()
  const paired = matchVoicePresetForAvatar(avatar)
  const clone = VOICE_PRESETS.find((v) => v.id === 'v-clone')
  if (isUserSavedAvatarId(avatar.id)) {
    return clone ? [paired, clone] : [paired]
  }
  return clone ? [paired, clone] : [paired]
}

/** 照片驱动 / 实拍视频：可选全部预置音色 + 通用 + 克隆 */
export function voiceOptionsForUploadDrive(): VoicePreset[] {
  return [...CUSTOM_UPLOAD_VOICE_PRESETS, ...AVATAR_VOICE_PRESETS, VOICE_CLONE_PRESET]
}

/** 自定义上传形象时的音色列表 */
export function voiceOptionsForCustomAvatar(): VoicePreset[] {
  return voiceOptionsForUploadDrive()
}

export function customAvatarVoiceDefaults(): Pick<DigitalHumanDraft, 'voiceId' | 'speechRate' | 'speechPitch'> {
  const preset = CUSTOM_UPLOAD_VOICE_PRESETS[0]!
  return { voiceId: preset.id, speechRate: preset.rate, speechPitch: preset.pitch }
}

export function voiceSettingsForAvatar(
  avatar: PresetAvatar & Partial<{ voiceId?: string; speechRate?: number; speechPitch?: number }>,
): Pick<DigitalHumanDraft, 'voiceId' | 'speechRate' | 'speechPitch'> {
  const saved = savedVoiceBindingForAvatar(avatar)
  if (saved) return saved
  const preset = matchVoicePresetForAvatar(avatar)
  return {
    voiceId: preset.id,
    speechRate: preset.rate,
    speechPitch: preset.pitch,
  }
}
