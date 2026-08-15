import type { AiAgentToolDef } from './types'

export const AI_AGENT_TOOLS: AiAgentToolDef[] = [
  {
    name: 'create_product',
    description:
      '仅当用户明确要求创建/上架/组品团购商品时调用。营收、营业额、订单、经营数据查询禁止调用本工具。调用后需用户在预览卡片确认。',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: '商品名称' },
        description: { type: 'string', description: '商品描述' },
        price_yuan: { type: 'number', description: '售价（元）' },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['douyin', 'kuaishou', 'meituan', 'dianping'] },
          description: '目标平台',
        },
        mode: {
          type: 'string',
          enum: ['draft', 'submit'],
          description: 'draft=保存草稿，submit=提交平台审核',
        },
      },
      required: ['product_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_image',
    description: '调用 AI 视觉工坊同款能力生成营销图/海报。可带参考图 URL 或 data URL。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '出图需求描述' },
        reference_image: { type: 'string', description: '可选参考图 https 或 data URL' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'mix_video',
    description: 'AI 混剪：根据用户描述启动短视频混剪流程，需要用户上传素材后继续。',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '混剪需求/口播要点' },
        duration_sec: { type: 'number', description: '期望成片时长（秒）' },
      },
      required: ['brief'],
      additionalProperties: false,
    },
  },
  {
    name: 'digital_human',
    description: '数字人口播：需要用户上传文案或素材后生成口播视频。',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: '口播文案' },
      },
      required: ['script'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_copy',
    description: '生成营销文案/种草文案，在智能体页展示结果。',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '文案主题' },
        platform: { type: 'string', description: '投放平台如抖音/小红书' },
        tone: { type: 'string', description: '语气风格' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'recruit_influencer',
    description: '生成达人招募 Brief 并进入预览确认流。',
    requiresConfirm: true,
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '招募需求说明' },
        city: { type: 'string', description: '目标城市' },
        platform: { type: 'string', description: '目标平台' },
      },
      required: ['brief'],
      additionalProperties: false,
    },
  },
]

export function getAiAgentTool(name: string): AiAgentToolDef | undefined {
  return AI_AGENT_TOOLS.find((t) => t.name === name)
}
