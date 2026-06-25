/** 用户上传并命名的数字人形象（元数据 localStorage + 人像 IndexedDB） */
import type { AvatarNationality, AvatarStyle, FrameMode, PresetAvatar } from './digitalHumanBroadcast.js'
import { compressPortraitDataUrlForLibrary } from './digitalHumanCustomMedia'
import {
  deleteUserSavedAvatarPortrait,
  loadUserSavedAvatarPortrait,
  saveUserSavedAvatarPortrait,
} from './digitalHumanWorkBlobStore'

export type UserSavedAvatar = PresetAvatar & {
  source: 'user'
  createdAt: string
  /** 人像 data URL（运行时从 IndexedDB 或内存缓存加载） */
  portraitDataUrl: string
}

type UserSavedAvatarMeta = Omit<UserSavedAvatar, 'portraitDataUrl' | 'previewUrl'>

const STORAGE_KEY = 'meoo_dh_user_avatars_v1'
const MAX_AVATARS = 48

const portraitCache = new Map<string, string>()
let migrationDone = false

function readMetaRows(): UserSavedAvatarMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object' && r.id))
      .map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        style: (r.style as AvatarStyle) ?? 'realistic',
        tag: String(r.tag ?? '我的上传'),
        gradient: String(r.gradient ?? 'from-violet-500 to-indigo-600'),
        gender: (r.gender as '男' | '女') ?? '女',
        bodyFrame: (r.bodyFrame as FrameMode) ?? 'half',
        nationality: (r.nationality as AvatarNationality) ?? 'cn',
        source: 'user' as const,
        createdAt: String(r.createdAt ?? new Date().toISOString()),
      }))
      .filter((r) => r.id && r.name)
  } catch {
    return []
  }
}

function writeMetaRows(rows: UserSavedAvatarMeta[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_AVATARS)))
  } catch {
    throw new Error('浏览器存储空间不足，请删除部分已保存形象后重试')
  }
}

function toUserSavedAvatar(meta: UserSavedAvatarMeta, portraitDataUrl: string): UserSavedAvatar {
  return {
    ...meta,
    portraitDataUrl,
    previewUrl: portraitDataUrl,
  }
}

async function migrateLegacyLocalStorageAvatars(): Promise<void> {
  if (migrationDone) return
  migrationDone = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    const hasEmbeddedPortrait = parsed.some(
      (r) =>
        r &&
        typeof r === 'object' &&
        typeof (r as { portraitDataUrl?: unknown }).portraitDataUrl === 'string' &&
        String((r as { portraitDataUrl: string }).portraitDataUrl).startsWith('data:image/'),
    )
    if (!hasEmbeddedPortrait) return

    const metas: UserSavedAvatarMeta[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !('id' in item)) continue
      const row = item as UserSavedAvatar
      if (!row.id) continue
      const portrait = String(row.portraitDataUrl ?? '').trim()
      if (portrait.startsWith('data:image/')) {
        const compressed = await compressPortraitDataUrlForLibrary(portrait)
        await saveUserSavedAvatarPortrait(row.id, compressed)
        portraitCache.set(row.id, compressed)
      }
      metas.push({
        id: row.id,
        name: row.name,
        style: row.style ?? 'realistic',
        tag: row.tag ?? '我的上传',
        gradient: row.gradient ?? 'from-violet-500 to-indigo-600',
        gender: row.gender ?? '女',
        bodyFrame: row.bodyFrame ?? 'half',
        nationality: row.nationality ?? 'cn',
        source: 'user',
        createdAt: row.createdAt ?? new Date().toISOString(),
      })
    }
    writeMetaRows(metas)
  } catch {
    /* 迁移失败不阻断后续读写 */
  }
}

async function hydrateMeta(meta: UserSavedAvatarMeta): Promise<UserSavedAvatar | null> {
  let portrait = portraitCache.get(meta.id)
  if (!portrait) {
    portrait = (await loadUserSavedAvatarPortrait(meta.id)) ?? undefined
    if (portrait) portraitCache.set(meta.id, portrait)
  }
  if (!portrait) return null
  return toUserSavedAvatar(meta, portrait)
}

export async function loadUserSavedAvatars(): Promise<UserSavedAvatar[]> {
  await migrateLegacyLocalStorageAvatars()
  const metas = readMetaRows()
  const rows: UserSavedAvatar[] = []
  for (const meta of metas) {
    const row = await hydrateMeta(meta)
    if (row) rows.push(row)
  }
  return rows
}

export async function addUserSavedAvatar(input: {
  name: string
  portraitDataUrl: string
  bodyFrame?: FrameMode
}): Promise<UserSavedAvatar> {
  const name = String(input.name || '').trim().slice(0, 24)
  if (!name) throw new Error('请为形象填写名称')
  const rawPortrait = String(input.portraitDataUrl || '').trim()
  if (!rawPortrait.startsWith('data:image/')) throw new Error('无效的人像图片')

  const portraitDataUrl = await compressPortraitDataUrlForLibrary(rawPortrait)
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `user-av-${crypto.randomUUID()}`
      : `user-av-${Date.now()}`
  const meta: UserSavedAvatarMeta = {
    id,
    name,
    style: 'realistic',
    tag: '我的上传',
    gradient: 'from-violet-500 to-indigo-600',
    gender: '女',
    bodyFrame: input.bodyFrame ?? 'half',
    nationality: 'cn',
    source: 'user',
    createdAt: new Date().toISOString(),
  }

  await saveUserSavedAvatarPortrait(id, portraitDataUrl)
  portraitCache.set(id, portraitDataUrl)
  writeMetaRows([meta, ...readMetaRows().filter((r) => r.id !== id)])
  return toUserSavedAvatar(meta, portraitDataUrl)
}

export async function deleteUserSavedAvatar(id: string): Promise<void> {
  writeMetaRows(readMetaRows().filter((r) => r.id !== id))
  portraitCache.delete(id)
  await deleteUserSavedAvatarPortrait(id)
}

export function isUserSavedAvatarId(id: string | null | undefined): boolean {
  return String(id || '').startsWith('user-av-')
}

export function findUserSavedAvatar(id: string | null | undefined): UserSavedAvatar | null {
  const key = String(id || '').trim()
  if (!key) return null
  const meta = readMetaRows().find((r) => r.id === key)
  if (!meta) return null
  const portrait = portraitCache.get(key)
  if (!portrait) return null
  return toUserSavedAvatar(meta, portrait)
}

/** 页面初始化时预加载形象库到内存缓存 */
export async function ensureUserSavedAvatarsReady(): Promise<UserSavedAvatar[]> {
  return loadUserSavedAvatars()
}
