/** 数字人口播 — 类型、预置数据与本地作品存储 */
import {
  deleteWorkCustomAvatar,
  deleteWorkMp4Blob,
  loadWorkCustomAvatar,
  saveWorkCustomAvatar,
} from './digitalHumanWorkBlobStore.js'

export type AvatarKind = 'preset' | 'photo' | 'video_clone'
export type AvatarStyle = 'realistic' | 'cartoon'
export type FrameMode = 'full' | 'half'
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
  frameMode: FrameMode
  resolution: Resolution
  driveMode: DriveMode
  script: string
  /** 链接驱动：抖音分享 URL */
  douyinLinkUrl: string
  /** 链接驱动 / 翻拍：分镜动作指令 */
  motionInstructions: string
  audioFileName: string | null
  voiceId: string
  speechRate: number
  speechPitch: number
  subtitleEnabled: boolean
  subtitleStyle: string
  greenScreen: boolean
  gesturePreset: string
  multiScene: boolean
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
  videoEngine?: 'qwen_s2v' | 'seedance' | 'kling'
  plannerModel?: 'doubao' | 'qwen'
  segmentCount?: number
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'av-real-1',
    name: '晓晨',
    style: 'realistic',
    tag: '商务男声',
    gender: '男',
    gradient: 'from-slate-600 to-slate-800',
    previewUrl: '/digital-human/avatars/av-real-1.jpg',
  },
  {
    id: 'av-real-2',
    name: '悦然',
    style: 'realistic',
    tag: '亲和女声',
    gender: '女',
    gradient: 'from-rose-400 to-orange-400',
    previewUrl: '/digital-human/avatars/av-real-2.jpg',
  },
  {
    id: 'av-real-3',
    name: '明哲',
    style: 'realistic',
    tag: '新闻播报',
    gender: '男',
    gradient: 'from-blue-600 to-indigo-700',
    previewUrl: '/digital-human/avatars/av-real-3.jpg',
  },
  {
    id: 'av-real-4',
    name: '诗涵',
    style: 'realistic',
    tag: '种草达人',
    gender: '女',
    gradient: 'from-pink-500 to-rose-500',
    previewUrl: '/digital-human/avatars/av-real-4.jpg',
  },
  {
    id: 'av-real-5',
    name: '俊杰',
    style: 'realistic',
    tag: '阳光男声',
    gender: '男',
    gradient: 'from-sky-500 to-blue-600',
    previewUrl: '/digital-human/avatars/av-real-5.jpg',
  },
  {
    id: 'av-real-6',
    name: '婉清',
    style: 'realistic',
    tag: '门店店长',
    gender: '女',
    gradient: 'from-teal-500 to-emerald-600',
    previewUrl: '/digital-human/avatars/av-real-6.jpg',
  },
  {
    id: 'av-real-7',
    name: '浩然',
    style: 'realistic',
    tag: '沉稳讲解',
    gender: '男',
    gradient: 'from-zinc-600 to-stone-700',
    previewUrl: '/digital-human/avatars/av-real-7.jpg',
  },
  {
    id: 'av-real-8',
    name: '思琪',
    style: 'realistic',
    tag: '活力女声',
    gender: '女',
    gradient: 'from-fuchsia-500 to-purple-600',
    previewUrl: '/digital-human/avatars/av-real-8.jpg',
  },
  {
    id: 'av-real-9',
    name: '子墨',
    style: 'realistic',
    tag: '探店 Vlog',
    gender: '男',
    gradient: 'from-amber-600 to-orange-700',
    previewUrl: '/digital-human/avatars/av-real-9.jpg',
  },
  {
    id: 'av-real-10',
    name: '静雯',
    style: 'realistic',
    tag: '温柔客服',
    gender: '女',
    gradient: 'from-indigo-400 to-violet-500',
    previewUrl: '/digital-human/avatars/av-real-10.jpg',
  },
  {
    id: 'av-real-11',
    name: '嘉伟',
    style: 'realistic',
    tag: '团购带货',
    gender: '男',
    gradient: 'from-cyan-600 to-blue-700',
    previewUrl: '/digital-human/avatars/av-real-11.jpg',
  },
  {
    id: 'av-real-12',
    name: '雨桐',
    style: 'realistic',
    tag: '美妆护肤',
    gender: '女',
    gradient: 'from-rose-500 to-pink-600',
    previewUrl: '/digital-human/avatars/av-real-12.jpg',
  },
  {
    id: 'cartoon-1',
    name: '小祺',
    style: 'cartoon',
    tag: '卡通 IP',
    gender: '女',
    gradient: 'from-cyan-400 to-teal-500',
    previewUrl: 'https://api.dicebear.com/7.x/adventurer/png?seed=XiaoQi&size=256',
  },
  {
    id: 'cartoon-2',
    name: '阿灵',
    style: 'cartoon',
    tag: '种草达人',
    gender: '女',
    gradient: 'from-violet-400 to-fuchsia-500',
    previewUrl: 'https://api.dicebear.com/7.x/lorelei/png?seed=A-Ling&size=256',
  },
  {
    id: 'cartoon-3',
    name: '团子',
    style: 'cartoon',
    tag: '萌系讲解',
    gender: '女',
    gradient: 'from-amber-300 to-orange-400',
    previewUrl: 'https://api.dicebear.com/7.x/fun-emoji/png?seed=TuanZi&size=256',
  },
  {
    id: 'cartoon-4',
    name: '小魔',
    style: 'cartoon',
    tag: '魔法导购',
    gender: '男',
    gradient: 'from-purple-500 to-indigo-600',
    previewUrl: 'https://api.dicebear.com/7.x/adventurer/png?seed=XiaoMo&size=256',
  },
  {
    id: 'cartoon-5',
    name: '星星',
    style: 'cartoon',
    tag: '少儿科普',
    gender: '女',
    gradient: 'from-yellow-400 to-amber-500',
    previewUrl: 'https://api.dicebear.com/7.x/big-smile/png?seed=StarStar&size=256',
  },
  {
    id: 'cartoon-6',
    name: '毛豆',
    style: 'cartoon',
    tag: '搞笑吐槽',
    gender: '男',
    gradient: 'from-lime-400 to-green-500',
    previewUrl: 'https://api.dicebear.com/7.x/avataaars/png?seed=MaoDou&size=256',
  },
  {
    id: 'cartoon-7',
    name: '糖糖',
    style: 'cartoon',
    tag: '甜品探店',
    gender: '女',
    gradient: 'from-pink-400 to-rose-400',
    previewUrl: 'https://api.dicebear.com/7.x/micah/png?seed=TangTang&size=256',
  },
  {
    id: 'cartoon-8',
    name: '阿橙',
    style: 'cartoon',
    tag: '活力男声',
    gender: '男',
    gradient: 'from-orange-400 to-red-500',
    previewUrl: 'https://api.dicebear.com/7.x/personas/png?seed=A-Cheng&size=256',
  },
  {
    id: 'cartoon-9',
    name: '乐活',
    style: 'cartoon',
    tag: '本地生活',
    gender: '女',
    gradient: 'from-emerald-400 to-teal-500',
    previewUrl: 'https://api.dicebear.com/7.x/notionists/png?seed=LeHuo&size=256',
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

/** 全部可选音色：21 套形象专属 + 克隆 */
export const VOICE_PRESETS: VoicePreset[] = [...AVATAR_VOICE_PRESETS, VOICE_CLONE_PRESET]

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
      return '真实门店内景，餐饮或零售场景，自然光线，生活化氛围'
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
  { id: 'emphasis', label: '强调（双手展开）' },
  { id: 'point', label: '指向（引导点击）' },
  { id: 'welcome', label: '欢迎（招手）' },
]

export const SUBTITLE_STYLES = [
  { id: 'bottom-white', label: '底部白字黑边' },
  { id: 'bottom-yellow', label: '底部黄字' },
  { id: 'top-minimal', label: '顶部简约' },
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
    frameMode: 'half',
    resolution: '720P',
    driveMode: 'link',
    script: '',
    douyinLinkUrl: '',
    motionInstructions: '',
    audioFileName: null,
    voiceId: voice.voiceId,
    speechRate: voice.speechRate,
    speechPitch: voice.speechPitch,
    subtitleEnabled: true,
    subtitleStyle: 'bottom-white',
    greenScreen: false,
    gesturePreset: 'emphasis',
    multiScene: false,
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
    return {
      ...row,
      outputMp4Url: keepRemote,
      outputBlobUrl: undefined,
      hasLocalMp4: Boolean(row.hasLocalMp4),
      hasLocalCustomAvatar: hasAvatar,
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

/** 写入作品：自定义人像进 IndexedDB，metadata 进 localStorage */
export async function upsertDigitalHumanWorkAsync(row: DigitalHumanWork): Promise<void> {
  const avatar = row.draft.customAvatarDataUrl?.trim()
  let stored = row
  if (avatar) {
    await saveWorkCustomAvatar(row.id, avatar)
    stored = {
      ...row,
      hasLocalCustomAvatar: true,
      draft: { ...row.draft, customAvatarDataUrl: null },
    }
  } else if (!row.hasLocalCustomAvatar) {
    await deleteWorkCustomAvatar(row.id)
  }
  upsertDigitalHumanWork(stored)
}

/** 渲染/编辑前恢复 draft 中的自定义人像 */
export async function hydrateDigitalHumanWork(work: DigitalHumanWork): Promise<DigitalHumanWork> {
  if (work.draft.customAvatarDataUrl?.trim()) return work
  if (!work.hasLocalCustomAvatar) return work
  const avatar = await loadWorkCustomAvatar(work.id)
  if (!avatar) return work
  return {
    ...work,
    draft: { ...work.draft, customAvatarDataUrl: avatar },
  }
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
}

export function findPresetAvatarForDraft(draft: DigitalHumanDraft): PresetAvatar | null {
  if (!draft.avatarId) return null
  return PRESET_AVATARS.find((a) => a.id === draft.avatarId) ?? null
}

export function resolveVoiceForDraft(
  draft: DigitalHumanDraft,
  avatar: PresetAvatar | null,
): VoicePreset | undefined {
  const byId = voicePresetById(draft.voiceId)
  if (byId) return byId
  if (avatar) return matchVoicePresetForAvatar(avatar)
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
      '大家好，我是晓晨。今天给大家推荐一款本地生活团购好物，品质靠谱、性价比很高，欢迎到店体验。',
    'av-real-2':
      '嗨，我是悦然。这条视频带你看看我们店里的招牌套餐，新客还有专属优惠，记得点赞收藏哦。',
    'av-real-3':
      '各位观众好，我是明哲。接下来为您播报今日门店活动详情，优惠力度大，名额有限，先到先得。',
    'av-real-4':
      '姐妹们好呀，我是诗涵。这款真的超级种草，我自己也在用，现在下单还有团购价，别错过啦。',
    'av-real-5':
      '嘿，我是俊杰。周末不知道吃什么？来我们店，环境好、分量足，线上团购更划算。',
    'av-real-6':
      '您好，我是婉清，本店店长。感谢一直支持我们的老顾客，新季菜单已上线，欢迎来店品尝。',
    'av-real-7':
      '大家好，我是浩然。下面用三分钟讲清楚这款产品的核心卖点和适用场景，帮您快速做决定。',
    'av-real-8':
      '哈喽，我是思琪。今天探店 vlog 走起，这家宝藏小店必须安利给你们，链接在下方团购里。',
    'av-real-9':
      '我是子墨，带你云探店。环境、口味、服务我都替你们看过了，结论就一句话：值得冲。',
    'av-real-10':
      '您好，我是静雯。如有任何订单或预约问题，都可以私信我，我会第一时间为您解答。',
    'av-real-11':
      '家人们好，我是嘉伟。今日团购爆款上线，库存不多，手慢无，赶紧点击下方链接下单。',
    'av-real-12':
      'Hi，我是雨桐。换季护肤别踩雷，今天这支好物亲测有效，敏感肌也可以放心尝试。',
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

/** 按形象 id 取专属音色（21 套一对一） */
export function matchVoicePresetForAvatar(avatar: PresetAvatar): VoicePreset {
  return AVATAR_VOICE_PRESETS.find((v) => v.avatarId === avatar.id) ?? AVATAR_VOICE_PRESETS[0]!
}

export function voicePresetById(voiceId: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((v) => v.id === voiceId)
}

/** 当前形象可选音色：专属音色 + 克隆 */
export function voiceOptionsForAvatar(avatar: PresetAvatar | null): VoicePreset[] {
  if (!avatar) return VOICE_PRESETS
  const paired = matchVoicePresetForAvatar(avatar)
  const clone = VOICE_PRESETS.find((v) => v.id === 'v-clone')
  return clone ? [paired, clone] : [paired]
}

export function voiceSettingsForAvatar(
  avatar: PresetAvatar,
): Pick<DigitalHumanDraft, 'voiceId' | 'speechRate' | 'speechPitch'> {
  const preset = matchVoicePresetForAvatar(avatar)
  return {
    voiceId: preset.id,
    speechRate: preset.rate,
    speechPitch: preset.pitch,
  }
}
