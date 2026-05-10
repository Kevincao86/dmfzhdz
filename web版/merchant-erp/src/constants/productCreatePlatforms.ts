export const PRODUCT_CREATE_PLATFORMS = [
  { id: 'douyin', name: '抖音来客', letter: '抖', color: 'from-pink-500 to-rose-500' },
  { id: 'meituan', name: '美团点评', letter: '美', color: 'from-yellow-500 to-orange-500' },
  { id: 'xiaohongshu', name: '小红书', letter: '红', color: 'from-red-500 to-pink-500' },
  { id: 'jd', name: '京东本地生活', letter: '京', color: 'from-red-600 to-red-500' },
] as const

export type CreatePlatformId = (typeof PRODUCT_CREATE_PLATFORMS)[number]['id']

export function isCreatePlatformId(s: string): s is CreatePlatformId {
  return (PRODUCT_CREATE_PLATFORMS as readonly { id: string }[]).some((p) => p.id === s)
}

/** 与 `/api/merchant/*` 路径段一致（小红书网关为 xhs） */
export function createPlatformApiSegment(id: CreatePlatformId): string {
  if (id === 'xiaohongshu') return 'xhs'
  return id
}

export function createPlatformLabel(id: CreatePlatformId): string {
  return PRODUCT_CREATE_PLATFORMS.find((p) => p.id === id)?.name ?? id
}
