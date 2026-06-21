import { postAiChat } from './ai/aiClient'

export async function optimizeShortVideoGuidancePrompt(
  raw: string,
  opts?: { hasProductImage?: boolean; frameMode?: boolean },
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const draft = raw.trim()
  if (draft.length < 4) {
    return { ok: false, message: '请先输入几个字或上传文档后再优化' }
  }

  const productHint = opts?.hasProductImage
    ? '用户会上传「重点产品图」作图生视频参考；请在文案中安排 1–2 个产品特写镜头（主体居中、轮廓清晰、包装细节可辨）。'
    : ''
  const modeHint = opts?.frameMode
    ? '用户另有分镜参考图，执导文案须与多镜头顺序一致。'
    : '输出适合单条 AI 短片的一次性执导描述。'

  try {
    const res = await postAiChat({
      provider: 'doubao',
      messages: [
        {
          role: 'system',
          content: `你是短视频编导，负责把商家的粗糙想法改写成 AI 视频模型可执行的「执导文案」（中文）。
要求：
- 保留用户原意、商品/场景/卖点，勿编造未提及的店名或价格
- 约 120–280 字，可写镜头运动、光线、节奏、人物动作与氛围
- 语言具体、可画面化；${modeHint}
- ${productHint || '若涉及商品，可建议特写呈现方式。'}
- 区分口播内容与画面/动作指导；口播用自然口语，画面与运镜单独描述
- 不要写 AI 生成技巧、上传参考图步骤、总时长、画幅比例、帧率、BGM 等技术参数（由界面选项控制）
- 不要要求在画面内出现字幕、标题、Logo 文字或任何可读文字（字幕由后期烧录）
- 只输出执导正文，不要 markdown、不要列表编号、不要引号包裹全文`,
        },
        { role: 'user', content: draft },
      ],
      temperature: 0.65,
    })
    const text = res.content?.trim()
    if (!text) return { ok: false, message: 'AI 未返回优化结果，请稍后重试' }
    return { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg || 'AI 优化失败' }
  }
}

export function productFocusPromptSuffix(): string {
  return '【产品呈现】镜头转到产品时使用上传的重点产品参考图，主体占画面中心，轮廓与包装细节清晰可辨，柔光突出质感，避免模糊与遮挡。'
}
