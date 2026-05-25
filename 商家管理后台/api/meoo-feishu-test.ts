/**
 * GET/POST /api/meoo-feishu-test — 验证飞书 Webhook 是否配置正确。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendFeishuTextNotify } from './feishuNotify.js'
import { sendOpsJson } from './safeOpsJson.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const secret = (process.env.MEOO_FEISHU_TEST_SECRET ?? '').trim()
  if (secret) {
    const q = typeof req.query.secret === 'string' ? req.query.secret : ''
    const h = req.headers['x-meoo-feishu-test-secret']
    const header = typeof h === 'string' ? h : ''
    if (q !== secret && header !== secret) {
      sendOpsJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
  }

  const sceneRaw = typeof req.query.scene === 'string' ? req.query.scene : 'recruitment'
  const scene =
    sceneRaw === 'support' ||
    sceneRaw === 'payment_order' ||
    sceneRaw === 'customer' ||
    sceneRaw === 'recruitment'
      ? sceneRaw
      : 'recruitment'

  const text = `墨典运营台 · 飞书通知测试\n场景：${scene}\n时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`
  const r = await sendFeishuTextNotify(scene, text)

  sendOpsJson(res, r.ok || r.skipped ? 200 : 502, {
    ok: r.ok,
    skipped: r.skipped,
    scene,
    error: r.error,
    status: r.status,
    hint: r.skipped
      ? '未配置 Webhook 或已关闭 MEOO_FEISHU_NOTIFY_ENABLED；请在 Vercel 运营后台项目配置 MEOO_FEISHU_WEBHOOK_URL 后重试。'
      : r.error?.includes('sign') || r.error?.includes('签名')
        ? '飞书返回签名校验失败：请在 Vercel 配置 MEOO_FEISHU_WEBHOOK_SECRET（与飞书机器人签名校验密钥一致），或关闭飞书签名校验。'
        : undefined,
  })
}
