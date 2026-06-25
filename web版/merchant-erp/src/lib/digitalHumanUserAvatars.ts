/** 用户上传并命名的数字人形象（持久化到 localStorage，与预置形象库合并展示） */
import type { AvatarNationality, AvatarStyle, FrameMode, PresetAvatar } from './digitalHumanBroadcast.js'

export type UserSavedAvatar = PresetAvatar & {
  source: 'user'
  createdAt: string
  /** 人像 data URL（已压缩） */
  portraitDataUrl: string
}

const STORAGE_KEY = 'meoo_dh_user_avatars_v1'

function readRows(): UserSavedAvatar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as UserSavedAvatar[]
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r.portraitDataUrl) : []
  } catch {
    return []
  }
}

function writeRows(rows: UserSavedAvatar[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 48)))
}

export function loadUserSavedAvatars(): UserSavedAvatar[] {
  return readRows()
}

export function addUserSavedAvatar(input: {
  name: string
  portraitDataUrl: string
  bodyFrame?: FrameMode
}): UserSavedAvatar {
  const name = String(input.name || '').trim().slice(0, 24)
  if (!name) throw new Error('请为形象填写名称')
  const portraitDataUrl = String(input.portraitDataUrl || '').trim()
  if (!portraitDataUrl.startsWith('data:image/')) throw new Error('无效的人像图片')

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `user-av-${crypto.randomUUID()}`
      : `user-av-${Date.now()}`
  const row: UserSavedAvatar = {
    id,
    name,
    style: 'realistic' as AvatarStyle,
    tag: '我的上传',
    gradient: 'from-violet-500 to-indigo-600',
    previewUrl: portraitDataUrl,
    gender: '女',
    bodyFrame: input.bodyFrame ?? 'half',
    nationality: 'cn' as AvatarNationality,
    source: 'user',
    createdAt: new Date().toISOString(),
    portraitDataUrl,
  }
  const next = [row, ...readRows().filter((r) => r.id !== id)]
  writeRows(next)
  return row
}

export function deleteUserSavedAvatar(id: string): void {
  writeRows(readRows().filter((r) => r.id !== id))
}

export function isUserSavedAvatarId(id: string | null | undefined): boolean {
  return String(id || '').startsWith('user-av-')
}

export function findUserSavedAvatar(id: string | null | undefined): UserSavedAvatar | null {
  const key = String(id || '').trim()
  if (!key) return null
  return readRows().find((r) => r.id === key) ?? null
}
