import { postAiAgentNativeImage } from '../../services/ai/aiClient'
import { isAgentDataDomain } from '../aiAgentSystemPromptRoute'
import { loadAgentPageDataContext } from '../agentPageDataLoaders'
import { parseToolCallArguments } from './openaiTools'
import type { AiAgentClientToolResult, AiAgentToolCall } from './types'

async function executeOne(call: AiAgentToolCall): Promise<AiAgentClientToolResult> {
  const tool = String(call.function?.name || '').trim()
  const args = parseToolCallArguments(call.function?.arguments)

  if (tool === 'fetch_page_data') {
    const raw = Array.isArray(args.domains) ? args.domains.map((d) => String(d)) : []
    const domains = raw.filter(isAgentDataDomain)
    if (!domains.length) {
      return { call, tool, ok: false, message: '请指定有效 domains（如 reviews、leads、metrics）' }
    }
    const text = await loadAgentPageDataContext(domains, '')
    return {
      call,
      tool,
      ok: true,
      message: text || '未拉到数据',
      data: { domains, digest: text },
    }
  }

  if (tool === 'generate_image') {
    const prompt = String(args.prompt || '').trim()
    if (!prompt) return { call, tool, ok: false, message: '缺少出图描述 prompt' }
    const ref = String(args.reference_image || '').trim() || undefined
    const out = await postAiAgentNativeImage(prompt, {
      exactPrompt: true,
      preferredVendor: 'qwen',
      referenceImageDataUrl: ref,
    })
    if (!out.ok) return { call, tool, ok: false, message: out.message }
    return {
      call,
      tool,
      ok: true,
      imageUrl: out.imageUrl,
      message: '已在智能体页生成图片',
      data: { imageUrl: out.imageUrl },
    }
  }

  if (tool === 'mix_video') {
    const brief = String(args.brief || '').trim()
    return {
      call,
      tool,
      ok: true,
      needsUpload: true,
      message: brief
        ? `混剪需求已记录：「${brief.slice(0, 80)}」。请打开「短视频 AI · AI混剪」上传/核对素材池后规划分镜并一键成片：/ai-operation/video-check`
        : '请打开「短视频 AI · AI混剪」上传至少 2 条素材后继续：/ai-operation/video-check',
      data: { brief, duration_sec: args.duration_sec },
    }
  }

  if (tool === 'digital_human') {
    const script = String(args.script || '').trim()
    return {
      call,
      tool,
      ok: true,
      needsUpload: true,
      message: script
        ? '口播文案已记录。请上传形象素材或前往「数字人」页生成，结果展示在智能体会话。'
        : '请提供口播文案并上传素材。',
      data: { script },
    }
  }

  if (tool === 'create_product') {
    const productName = String(args.product_name || '').trim()
    const platforms = Array.isArray(args.platforms)
      ? args.platforms.map((p) => String(p))
      : undefined
    return {
      call,
      tool,
      ok: true,
      needsConfirm: true,
      message: '已解析创建商品意图，请确认下方预览卡片后选择「保存至草稿」或「提交至平台」。',
      mode: args.mode === 'submit' ? 'submit' : 'draft',
      platforms,
      planDraft: {
        productName,
        brief: productName,
        description: String(args.description || ''),
        price_yuan: Number(args.price_yuan) || undefined,
      },
      data: args,
    }
  }

  if (tool === 'generate_copy') {
    const topic = String(args.topic || '').trim()
    return {
      call,
      tool,
      ok: true,
      needsConfirm: true,
      scenarioKey: 'generate_copywriting',
      message: `已收到文案主题「${topic || '未指定'}」，正在准备文案预览…`,
      data: args,
    }
  }

  if (tool === 'recruit_influencer') {
    return {
      call,
      tool,
      ok: true,
      needsConfirm: true,
      message: '已解析达人招募意图，请确认 Brief 预览后执行。',
      data: {
        brief: String(args.brief || ''),
        city: String(args.city || ''),
        platform: String(args.platform || ''),
      },
    }
  }

  return { call, tool, ok: false, message: `未知工具：${tool}` }
}

export async function executeAiAgentToolCalls(
  calls: AiAgentToolCall[],
  opts?: { signal?: AbortSignal },
): Promise<AiAgentClientToolResult[]> {
  const out: AiAgentClientToolResult[] = []
  for (const call of calls) {
    if (opts?.signal?.aborted) break
    try {
      out.push(await executeOne(call))
    } catch (e) {
      out.push({
        call,
        tool: String(call.function?.name || ''),
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return out
}

export async function executeAiAgentToolClient(
  call: AiAgentToolCall,
): Promise<AiAgentClientToolResult> {
  return executeOne(call)
}
