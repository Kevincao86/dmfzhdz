/**
 * 短视频创作台 Agent / 创作模式（对齐即梦模式切换）
 */

export type ShortVideoStudioModeId =
  | 'agent'
  | 'video'
  | 'image'
  | 'music'
  | 'digital_human'
  | 'canvas'

export type ShortVideoStudioMode = {
  id: ShortVideoStudioModeId
  label: string
  description: string
  /** 站内路由；空表示留在本页并切换 pane */
  href?: string
  pane?: 'generate' | 'canvas' | 'cloud_batch' | 'cases' | 'music'
}

export const SHORT_VIDEO_STUDIO_MODES: ShortVideoStudioMode[] = [
  {
    id: 'agent',
    label: 'Agent 模式',
    description: '自然语言 + Skill，自动规划分镜出片',
    pane: 'generate',
  },
  {
    id: 'video',
    label: '视频生成',
    description: '文生/图生短片（Seedance）',
    pane: 'generate',
  },
  {
    id: 'image',
    label: '图片生成',
    description: '跳转 AI 视觉工坊',
    href: '/ai-image',
  },
  {
    id: 'music',
    label: '音乐 / 配乐',
    description: '内容匹配曲库试听选用（独立工作区）',
    pane: 'music',
  },
  {
    id: 'digital_human',
    label: '数字人口播',
    description: '跳转数字人一体化出片',
    href: '/ai-operation/digital-human',
  },
  {
    id: 'canvas',
    label: '无限画布',
    description: '分镜与参考素材同屏编排',
    pane: 'canvas',
  },
]

export function findStudioMode(id: string | null | undefined): ShortVideoStudioMode {
  return SHORT_VIDEO_STUDIO_MODES.find((m) => m.id === id) ?? SHORT_VIDEO_STUDIO_MODES[0]!
}
