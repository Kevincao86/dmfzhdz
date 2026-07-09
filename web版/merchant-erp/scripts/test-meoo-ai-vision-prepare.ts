/**
 * 回归：豆包/通义 provider 须透传 imageDataUrls（混剪素材分析依赖此行为）。
 * 用法：cd web版/merchant-erp && npx tsx scripts/test-meoo-ai-vision-prepare.ts
 */
import { MAX_AI_CHAT_IMAGE_ATTACHMENTS } from '../src/services/ai/types.js'

function parseImages(provider: string, imageDataUrls: unknown): string[] | undefined {
  const parsedImages = Array.isArray(imageDataUrls)
    ? imageDataUrls
        .filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
        .slice(0, MAX_AI_CHAT_IMAGE_ATTACHMENTS)
    : []
  return parsedImages.length > 0 &&
    (provider === 'tokenmix' || provider === 'doubao' || provider === 'qwen')
    ? parsedImages
    : undefined
}

const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q=='

let failed = 0
for (const provider of ['doubao', 'qwen', 'tokenmix'] as const) {
  const out = parseImages(provider, [img])
  if (!out?.length) {
    console.error(`FAIL: ${provider} 应保留 imageDataUrls`)
    failed++
  }
}
const deepseek = parseImages('deepseek', [img])
if (deepseek?.length) {
  console.error('FAIL: deepseek 不应透传 imageDataUrls')
  failed++
}

if (failed > 0) process.exit(1)
console.log('OK: doubao/qwen/tokenmix 透传 imageDataUrls 逻辑正确')
