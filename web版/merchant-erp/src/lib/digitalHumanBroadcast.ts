/** 数字人口播 — 类型、预置数据与本地作品存储 */

export type AvatarKind = 'preset' | 'photo' | 'video_clone'
export type AvatarStyle = 'realistic' | 'cartoon'
export type FrameMode = 'full' | 'half'
export type DriveMode = 'text' | 'audio' | 'link'
export type Resolution = '1080p' | '4k'
export type WorkStatus = 'draft' | 'queued' | 'rendering' | 'completed' | 'failed'

export type PresetAvatar = {
  id: string
  name: string
  style: AvatarStyle
  tag: string
  gradient: string
  /** 公开预览图（Unsplash / DiceBear 等） */
  previewUrl: string
  gender: '男' | '女'
}

export type VoicePreset = {
  id: string
  label: string
  gender: '男' | '女'
  dialect?: string
  rate: number
  pitch: number
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
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'av-real-1',
    name: '晓晨',
    style: 'realistic',
    tag: '商务男声',
    gender: '男',
    gradient: 'from-slate-600 to-slate-800',
    previewUrl: '/digital-human/avatars/av-real-1.png',
  },
  {
    id: 'av-real-2',
    name: '悦然',
    style: 'realistic',
    tag: '亲和女声',
    gender: '女',
    gradient: 'from-rose-400 to-orange-400',
    previewUrl: '/digital-human/avatars/av-real-2.png',
  },
  {
    id: 'av-real-3',
    name: '明哲',
    style: 'realistic',
    tag: '新闻播报',
    gender: '男',
    gradient: 'from-blue-600 to-indigo-700',
    previewUrl: '/digital-human/avatars/av-real-3.png',
  },
  {
    id: 'av-real-4',
    name: '诗涵',
    style: 'realistic',
    tag: '种草达人',
    gender: '女',
    gradient: 'from-pink-500 to-rose-500',
    previewUrl: '/digital-human/avatars/av-real-4.png',
  },
  {
    id: 'av-real-5',
    name: '俊杰',
    style: 'realistic',
    tag: '阳光男声',
    gender: '男',
    gradient: 'from-sky-500 to-blue-600',
    previewUrl: '/digital-human/avatars/av-real-5.png',
  },
  {
    id: 'av-real-6',
    name: '婉清',
    style: 'realistic',
    tag: '门店店长',
    gender: '女',
    gradient: 'from-teal-500 to-emerald-600',
    previewUrl: '/digital-human/avatars/av-real-6.png',
  },
  {
    id: 'av-real-7',
    name: '浩然',
    style: 'realistic',
    tag: '沉稳讲解',
    gender: '男',
    gradient: 'from-zinc-600 to-stone-700',
    previewUrl: '/digital-human/avatars/av-real-7.png',
  },
  {
    id: 'av-real-8',
    name: '思琪',
    style: 'realistic',
    tag: '活力女声',
    gender: '女',
    gradient: 'from-fuchsia-500 to-purple-600',
    previewUrl: '/digital-human/avatars/av-real-8.png',
  },
  {
    id: 'av-real-9',
    name: '子墨',
    style: 'realistic',
    tag: '探店 Vlog',
    gender: '男',
    gradient: 'from-amber-600 to-orange-700',
    previewUrl: '/digital-human/avatars/av-real-9.png',
  },
  {
    id: 'av-real-10',
    name: '静雯',
    style: 'realistic',
    tag: '温柔客服',
    gender: '女',
    gradient: 'from-indigo-400 to-violet-500',
    previewUrl: '/digital-human/avatars/av-real-10.png',
  },
  {
    id: 'av-real-11',
    name: '嘉伟',
    style: 'realistic',
    tag: '团购带货',
    gender: '男',
    gradient: 'from-cyan-600 to-blue-700',
    previewUrl: '/digital-human/avatars/av-real-11.png',
  },
  {
    id: 'av-real-12',
    name: '雨桐',
    style: 'realistic',
    tag: '美妆护肤',
    gender: '女',
    gradient: 'from-rose-500 to-pink-600',
    previewUrl: '/digital-human/avatars/av-real-12.png',
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

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'v-f-std', label: '标准女声', gender: '女', rate: 1, pitch: 1 },
  { id: 'v-m-std', label: '标准男声', gender: '男', rate: 1, pitch: 0.95 },
  { id: 'v-f-soft', label: '温柔女声', gender: '女', rate: 0.92, pitch: 1.05 },
  { id: 'v-m-deep', label: '磁性男声', gender: '男', rate: 0.88, pitch: 0.85 },
  { id: 'v-sc', label: '四川话（方言）', gender: '女', dialect: '四川', rate: 1, pitch: 1 },
  { id: 'v-yue', label: '粤语（方言）', gender: '男', dialect: '粤语', rate: 1, pitch: 1 },
  { id: 'v-clone', label: '我的克隆音色', gender: '女', rate: 1, pitch: 1 },
]

export const BACKGROUND_OPTIONS = [
  { id: 'studio', label: '演播室' },
  { id: 'store', label: '门店实景' },
  { id: 'green', label: '绿幕（可换背景）' },
  { id: 'solid-blue', label: '纯色 · 品牌蓝' },
  { id: 'custom', label: '自定义图片/视频' },
]

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
  return {
    avatarId: PRESET_AVATARS[0]?.id ?? null,
    customAvatarDataUrl: null,
    avatarKind: 'preset',
    outfit: '商务正装',
    hairstyle: '默认',
    background: 'studio',
    frameMode: 'half',
    resolution: '1080p',
    driveMode: 'link',
    script: '',
    douyinLinkUrl: '',
    motionInstructions: '',
    audioFileName: null,
    voiceId: VOICE_PRESETS[0]?.id ?? 'v-f-std',
    speechRate: 1,
    speechPitch: 1,
    subtitleEnabled: true,
    subtitleStyle: 'bottom-white',
    greenScreen: false,
    gesturePreset: 'emphasis',
    multiScene: false,
  }
}

const WORKS_KEY = 'meoo_digital_human_works_v1'

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

export function saveDigitalHumanWorks(rows: DigitalHumanWork[]): void {
  localStorage.setItem(WORKS_KEY, JSON.stringify(rows))
}

export function upsertDigitalHumanWork(row: DigitalHumanWork): void {
  const list = loadDigitalHumanWorks()
  const ix = list.findIndex((w) => w.id === row.id)
  if (ix >= 0) list[ix] = row
  else list.unshift(row)
  saveDigitalHumanWorks(list)
}

export function deleteDigitalHumanWork(id: string): void {
  saveDigitalHumanWorks(loadDigitalHumanWorks().filter((w) => w.id !== id))
}

export function workTitleFromDraft(d: DigitalHumanDraft): string {
  const line = d.script.trim().split(/\n/)[0]?.slice(0, 24)
  if (line) return line
  if (d.audioFileName) return d.audioFileName.replace(/\.[^.]+$/, '')
  const av = PRESET_AVATARS.find((a) => a.id === d.avatarId)
  return av ? `${av.name} · 口播` : '未命名口播'
}
