import { config } from '../config.js'

function resolveWebhookUrl() {
  const full = config.wecom.webhookUrl
  if (full) return full
  const key = config.wecom.webhookKey
  if (key) return `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`
  return ''
}

/**
 * 发送群机器人 Markdown。无 Webhook 或 DRY_RUN 时只打印。
 * @see https://developer.work.weixin.qq.com/document/path/91770
 */
export async function sendMarkdown(content, { title = '企微机器人' } = {}) {
  const text = String(content || '').trim()
  if (!text) return { ok: false, skipped: true, reason: 'empty' }

  const url = resolveWebhookUrl()
  const forceDry = config.dryRun || !url

  if (forceDry) {
    console.log(`\n========== [DRY_RUN] ${title} ==========\n`)
    console.log(text)
    console.log('\n========================================\n')
    return { ok: true, dryRun: true, reason: config.dryRun ? 'DRY_RUN' : 'no_webhook' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content: text.slice(0, 4096) },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`webhook 失败: ${data.errcode} ${data.errmsg || ''}`)
  }
  return { ok: true, dryRun: false, data }
}
