#!/usr/bin/env node
/**
 * 在线客服通道自检（默认走 ERP 同源 + Vite 代理，与浏览器一致）。
 * 前置：①商家管理后台 npm run dev ②merchant-erp npm run dev
 *
 * 用法：node scripts/support-relay-smoke.mjs
 * 可选：SUPPORT_RELAY_URL=ws://127.0.0.1:5173/__meoo_support_online node scripts/support-relay-smoke.mjs
 */

const url = (process.env.SUPPORT_RELAY_URL || 'ws://127.0.0.1:5173/__meoo_support_online').trim()
const sessionId = `smoke_${Date.now()}`

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const t = setTimeout(() => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(
        new Error(
          `${name}: 连接 ${url} 超时（请先①管理后台 dev + npm install(ws) ②ERP dev，使 Vite 能代理该路径）`,
        ),
      )
    }, 5000)
    ws.addEventListener('open', () => {
      clearTimeout(t)
      resolve(ws)
    })
    ws.addEventListener('error', () => {
      clearTimeout(t)
      reject(new Error(`${name}: WebSocket 错误（${url} 不可达）`))
    })
  })
}

function recvChat(ws, wantFrom, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ws.close()
      reject(new Error(`超时未收到来自 ${wantFrom} 的 chat`))
    }, timeoutMs)
    const onMessage = (ev) => {
      let data
      try {
        data = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (!data || data.type !== 'chat') return
      if (data.from !== wantFrom) return
      if (data.sessionId !== sessionId) return
      clearTimeout(t)
      ws.removeEventListener('message', onMessage)
      resolve(data)
    }
    ws.addEventListener('message', onMessage)
  })
}

async function main() {
  console.log(`[smoke] 目标: ${url}  sessionId=${sessionId}`)

  const merchant = await connect('merchant')
  const ops = await connect('ops')

  merchant.send(JSON.stringify({ type: 'identify', role: 'merchant', sessionId }))
  ops.send(JSON.stringify({ type: 'identify', role: 'ops' }))
  await wait(80)

  const merchantToOps = {
    type: 'chat',
    sessionId,
    from: 'user',
    text: '【smoke】商家端测试消息',
    ts: Date.now(),
    id: `m_${Date.now()}`,
  }
  merchant.send(JSON.stringify(merchantToOps))

  const gotOnOps = await recvChat(ops, 'user')
  if (gotOnOps.text !== merchantToOps.text) {
    throw new Error(`运营端收到文案不一致: ${gotOnOps.text}`)
  }
  console.log('[smoke] OK 运营端已收到商家 user 消息')

  const opsReply = {
    type: 'chat',
    sessionId,
    from: 'ops',
    text: '【smoke】运营端回复',
    ts: Date.now(),
    id: `o_${Date.now()}`,
  }
  ops.send(JSON.stringify(opsReply))

  const gotOnMerchant = await recvChat(merchant, 'ops')
  if (gotOnMerchant.text !== opsReply.text) {
    throw new Error(`商家端收到文案不一致: ${gotOnMerchant.text}`)
  }
  console.log('[smoke] OK 商家端已收到运营 ops 消息')

  merchant.close()
  ops.close()
  console.log('[smoke] 全部通过')
}

main().catch((e) => {
  console.error('[smoke] 失败:', e.message || e)
  process.exit(1)
})
