/** 门店实景：预置 AI 生成竖版背景（public/digital-human/store-scenes） */

export type StoreSceneId = 'restaurant' | 'ktv' | 'hotel' | 'scenery'

export type StoreSceneOption = {
  id: StoreSceneId
  label: string
  prompt: string
  /** 静态资源文件名（不含路径） */
  assetFile: string
}

export const STORE_SCENE_ASSET_VERSION = 'dh20260625'

export const STORE_SCENE_OPTIONS: StoreSceneOption[] = [
  {
    id: 'restaurant',
    label: '餐厅',
    assetFile: 'store-scene-restaurant.jpg',
    prompt:
      '竖版9:16高清实景：现代中式餐厅内景，暖色灯光，整洁餐桌与绿植，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'ktv',
    label: 'KTV',
    assetFile: 'store-scene-ktv.jpg',
    prompt:
      '竖版9:16高清实景：时尚KTV包厢内景，霓虹灯带与沙发，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'hotel',
    label: '酒店',
    assetFile: 'store-scene-hotel.jpg',
    prompt:
      '竖版9:16高清实景：精品酒店大堂或客房，明亮高级，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'scenery',
    label: '景点',
    assetFile: 'store-scene-scenery.jpg',
    prompt:
      '竖版9:16高清实景：城市网红打卡景点户外，自然光，无人物，适合口播背景，真实摄影质感',
  },
]

/** 列表/预览用静态 URL（已内置 AI 生成图，无需再请求生图 API） */
export function storeScenePreviewUrl(sceneId: StoreSceneId): string {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  const file = scene?.assetFile ?? `store-scene-${sceneId}.jpg`
  return `/digital-human/store-scenes/${file}?v=${STORE_SCENE_ASSET_VERSION}`
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const mime = blob.type || 'image/jpeg'
  return `data:${mime};base64,${btoa(binary)}`
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`背景图加载失败 HTTP ${res.status}`)
  return blobToDataUrl(await res.blob())
}

/** 合成用：拉取预置背景并转为 data URL */
export async function resolveStoreSceneBackgroundDataUrl(sceneId: StoreSceneId): Promise<string> {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  if (!scene) throw new Error('未知门店实景类型')
  return urlToDataUrl(storeScenePreviewUrl(sceneId))
}

export function storeScenePrompt(sceneId: StoreSceneId | null | undefined): string {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  return scene?.prompt ?? '真实门店内景，餐饮或零售场景，自然光线，生活化氛围'
}
