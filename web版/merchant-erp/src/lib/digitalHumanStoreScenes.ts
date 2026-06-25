/** 门店实景：四类场景 AI 生图（失败时 canvas 兜底） */
import { postDouyinGoodsAiAssist } from '../services/douyinAiAssistApi.js'

export type StoreSceneId = 'restaurant' | 'ktv' | 'hotel' | 'scenery'

export type StoreSceneOption = {
  id: StoreSceneId
  label: string
  prompt: string
}

export const STORE_SCENE_OPTIONS: StoreSceneOption[] = [
  {
    id: 'restaurant',
    label: '餐厅',
    prompt:
      '竖版9:16高清实景：现代中式餐厅内景，暖色灯光，整洁餐桌与绿植，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'ktv',
    label: 'KTV',
    prompt:
      '竖版9:16高清实景：时尚KTV包厢内景，霓虹灯带与沙发，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'hotel',
    label: '酒店',
    prompt:
      '竖版9:16高清实景：精品酒店大堂或客房，明亮高级，无人物，适合口播背景，真实摄影质感',
  },
  {
    id: 'scenery',
    label: '景点',
    prompt:
      '竖版9:16高清实景：城市网红打卡景点户外，自然光，无人物，适合口播背景，真实摄影质感',
  },
]

const CACHE_KEY = 'meoo_dh_store_scene_cache_v1'

type SceneCache = Partial<Record<StoreSceneId, string>>

function readCache(): SceneCache {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SceneCache
  } catch {
    return {}
  }
}

function writeCache(cache: SceneCache): void {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

function canvasFallback(scene: StoreSceneOption): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const palettes: Record<StoreSceneId, [string, string, string]> = {
    restaurant: ['#3d2b1f', '#8b5a2b', '#f5deb3'],
    ktv: ['#1a0a2e', '#6b21a8', '#f0abfc'],
    hotel: ['#1e293b', '#64748b', '#f8fafc'],
    scenery: ['#0c4a6e', '#38bdf8', '#fef9c3'],
  }
  const [c0, c1, c2] = palettes[scene.id]
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  g.addColorStop(0, c0)
  g.addColorStop(0.55, c1)
  g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(80 + i * 120, 400 + (i % 3) * 180, 200, 320)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'bold 48px sans-serif'
  ctx.fillText(scene.label, 80, 200)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => (typeof r.result === 'string' ? resolve(r.result) : reject(new Error('读取失败')))
    r.onerror = () => reject(new Error('读取失败'))
    r.readAsDataURL(blob)
  })
}

/** 获取门店实景图（优先缓存 → AI 生图 → canvas 兜底） */
export async function resolveStoreSceneBackgroundDataUrl(sceneId: StoreSceneId): Promise<string> {
  const cache = readCache()
  if (cache[sceneId]?.startsWith('data:image/')) return cache[sceneId]!

  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  if (!scene) throw new Error('未知门店实景类型')

  try {
    const r = await postDouyinGoodsAiAssist({
      model: 'qwen',
      action: 'image_generate',
      product_name: '数字人口播背景',
      listing_title: `门店实景·${scene.label}`,
      image_user_line: scene.prompt,
      image_role: 'env',
    })
    const url = r.ok ? r.image_urls?.[0] : undefined
    if (url && /^https?:\/\//i.test(url)) {
      const dataUrl = await urlToDataUrl(url)
      writeCache({ ...cache, [sceneId]: dataUrl })
      return dataUrl
    }
  } catch {
    /* fallback below */
  }

  const fallback = canvasFallback(scene)
  if (fallback) writeCache({ ...cache, [sceneId]: fallback })
  return fallback
}

export function storeScenePrompt(sceneId: StoreSceneId | null | undefined): string {
  const scene = STORE_SCENE_OPTIONS.find((s) => s.id === sceneId)
  return scene?.prompt ?? '真实门店内景，餐饮或零售场景，自然光线，生活化氛围'
}
