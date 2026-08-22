/** 门店实景：预置 AI 生成竖版背景（public/digital-human/store-scenes） */

import { merchantStaticUrl, webStaticCandidates } from './webStaticOssAssets'

export type StoreSceneId =
  | 'restaurant'
  | 'hotpot'
  | 'tea'
  | 'beauty'
  | 'spa'
  | 'gym'
  | 'ktv'
  | 'hotel'
  | 'scenery'

export type StoreSceneOption = {
  id: StoreSceneId
  label: string
  prompt: string
  /** 静态资源文件名（不含路径） */
  assetFile: string
}

export const STORE_SCENE_ASSET_VERSION = 'dh20260822'

export const STORE_SCENE_OPTIONS: StoreSceneOption[] = [
  {
    id: 'restaurant',
    label: '餐饮堂食',
    assetFile: 'store-scene-restaurant.jpg',
    prompt: '竖版9:16：中式casual餐厅内景，暖光餐桌，适合堂食口播背景',
  },
  {
    id: 'hotpot',
    label: '火锅',
    assetFile: 'store-scene-hotpot.jpg',
    prompt: '竖版9:16：火锅店卡座与铜锅，暖灯笼，适合套餐口播背景',
  },
  {
    id: 'tea',
    label: '茶饮',
    assetFile: 'store-scene-tea.jpg',
    prompt: '竖版9:16：茶饮店吧台与杯品，浅色灯光，适合饮品口播背景',
  },
  {
    id: 'beauty',
    label: '美业',
    assetFile: 'store-scene-beauty.jpg',
    prompt: '竖版9:16：美发美甲店内景，镜面与工位，适合美业口播背景',
  },
  {
    id: 'spa',
    label: '到综',
    assetFile: 'store-scene-spa.jpg',
    prompt: '竖版9:16：到综/养生馆接待过道，暖木色，适合接待口播背景',
  },
  {
    id: 'gym',
    label: '健身',
    assetFile: 'store-scene-gym.jpg',
    prompt: '竖版9:16：精品健身房，哑铃与木地板，适合办卡口播背景',
  },
  {
    id: 'ktv',
    label: 'KTV',
    assetFile: 'store-scene-ktv.jpg',
    prompt: '竖版9:16：KTV包厢霓虹与沙发，适合到综娱乐口播背景',
  },
  {
    id: 'hotel',
    label: '酒店',
    assetFile: 'store-scene-hotel.jpg',
    prompt: '竖版9:16：精品酒店大堂，适合接待口播背景',
  },
  {
    id: 'scenery',
    label: '街景打卡',
    assetFile: 'store-scene-scenery.jpg',
    prompt: '竖版9:16：夜市滨水街景，适合探店开场背景',
  },
]

function storeSceneLocalPath(sceneId: StoreSceneId): string {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  const file = scene?.assetFile ?? `store-scene-${sceneId}.jpg`
  return `/digital-human/store-scenes/${file}`
}

/** 列表/预览用静态 URL（已内置 AI 生成图，无需再请求生图 API） */
export function storeScenePreviewUrl(sceneId: StoreSceneId): string {
  // 预览优先同源，避免依赖 OSS（部分环境 fetch/显示异常）
  return storeScenePreviewCandidates(sceneId)[0] || merchantStaticUrl(storeSceneLocalPath(sceneId))
}

/** 预览候选：同源 local 优先，再 OSS */
export function storeScenePreviewCandidates(sceneId: StoreSceneId): string[] {
  const candidates = webStaticCandidates('merchant', storeSceneLocalPath(sceneId))
  return [...candidates]
    .map((u) => (u.startsWith('/') ? `${u.split('?')[0]}?v=${STORE_SCENE_ASSET_VERSION}` : u))
    .sort((a, b) => {
      const aLocal = a.startsWith('/') ? 0 : 1
      const bLocal = b.startsWith('/') ? 0 : 1
      return aLocal - bLocal
    })
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () =>
        typeof r.result === 'string' ? resolve(r.result) : reject(new Error('背景图读取失败'))
      r.onerror = () => reject(new Error('背景图读取失败'))
      r.readAsDataURL(blob)
    })
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x2000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const mime = blob.type || 'image/jpeg'
  return `data:${mime};base64,${btoa(binary)}`
}

async function fetchUrlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`背景图加载失败 HTTP ${res.status}`)
  return blobToDataUrl(await res.blob())
}

/** fetch 失败时：用 Image + canvas（同源无需 CORS；跨域需 OSS 允许） */
async function imageElementToDataUrl(url: string): Promise<string> {
  if (typeof document === 'undefined') throw new Error('非浏览器环境无法解码背景图')
  const img = new Image()
  if (!url.startsWith('/') && !url.startsWith('data:')) {
    img.crossOrigin = 'anonymous'
  }
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('背景图解码失败'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  if (!canvas.width || !canvas.height) throw new Error('背景图尺寸无效')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function urlToDataUrl(url: string): Promise<string> {
  try {
    return await fetchUrlToDataUrl(url)
  } catch {
    return await imageElementToDataUrl(url)
  }
}

/** 合成用：拉取预置背景并转为 data URL（同源优先，失败再试 OSS / Image） */
export async function resolveStoreSceneBackgroundDataUrl(sceneId: StoreSceneId): Promise<string> {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  if (!scene) throw new Error('未知门店实景类型')
  const ordered = storeScenePreviewCandidates(sceneId)
  let lastErr: Error | null = null
  for (const url of ordered) {
    try {
      return await urlToDataUrl(url)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('门店实景加载失败')
}

export function storeScenePrompt(sceneId: StoreSceneId | null | undefined): string {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  return scene?.prompt ?? '真实门店内景，餐饮或零售场景，自然光线，生活化氛围'
}
