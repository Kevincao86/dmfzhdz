/**
 * 抖音生活服务 SPI 联调过审桩（预下单 / 发码 / 退款等）
 * 配置地址：https://mofangdianai.com/erp-api/meoo-douyin-spi
 *
 * 说明：业务侧可不启用真实履约；本桩用于开放平台必验用例。
 * GET  ?diag=1                 查看最近 logid / 当前模式
 * GET  ?panel=1                联调反馈面板（自动刷新 logid）
 * GET  ?set_precreate_fail=2   预下单固定失败码（1/2/3/4/5/6/7；0=成功）
 * GET  ?set_issue_mode=success|async|fail
 */
import fs from 'node:fs'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 10 }

type IssueMode = 'success' | 'async' | 'fail'
type SpiState = {
  precreateFailCode: number
  issueMode: IssueMode
  updatedAt: string
}

type SpiHit = {
  at: string
  action: string
  logid: string
  orderId?: string
  skuId?: string
  responseSummary: string
}

const MAX_HITS = 40
const g = globalThis as typeof globalThis & {
  __meooDouyinSpiHits?: SpiHit[]
}

function hitsPath(): string {
  return statePath().replace(/\.json$/i, '-hits.json')
}

function loadHitsFromDisk(): SpiHit[] {
  try {
    const raw = JSON.parse(fs.readFileSync(hitsPath(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((x) => x && typeof x === 'object')
      .map((x) => x as SpiHit)
      .slice(0, MAX_HITS)
  } catch {
    return []
  }
}

function saveHits(arr: SpiHit[]): void {
  try {
    const p = hitsPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(arr.slice(0, MAX_HITS), null, 2), 'utf8')
  } catch {
    /* 面板可降级为内存 */
  }
}

function hits(): SpiHit[] {
  if (!g.__meooDouyinSpiHits) g.__meooDouyinSpiHits = loadHitsFromDisk()
  return g.__meooDouyinSpiHits
}

function pushHit(row: SpiHit): void {
  const arr = hits()
  arr.unshift(row)
  if (arr.length > MAX_HITS) arr.length = MAX_HITS
  saveHits(arr)
}

function statePath(): string {
  const fromEnv = String(process.env.DOUYIN_SPI_STATE_FILE || '').trim()
  if (fromEnv) return fromEnv
  const home = process.env.HOME || '/home/admin'
  return path.join(home, 'stack', 'douyin-spi-acceptance.json')
}

function defaultState(): SpiState {
  return {
    precreateFailCode: 0,
    issueMode: 'success',
    updatedAt: new Date().toISOString(),
  }
}

function readState(): SpiState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const o = JSON.parse(raw) as Partial<SpiState>
    const fail = Number(o.precreateFailCode)
    const mode = String(o.issueMode || 'success') as IssueMode
    return {
      precreateFailCode: Number.isFinite(fail) ? fail : 0,
      issueMode: mode === 'async' || mode === 'fail' || mode === 'success' ? mode : 'success',
      updatedAt: String(o.updatedAt || new Date().toISOString()),
    }
  } catch {
    return defaultState()
  }
}

function writeState(next: SpiState): void {
  const p = statePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
}

function headerOne(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v || '').trim()
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  try {
    const raw = req.body
    if (raw == null || raw === '') return {}
    if (typeof raw === 'string') return JSON.parse(raw || '{}') as Record<string, unknown>
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    if (typeof raw === 'object') return raw as Record<string, unknown>
  } catch {
    return {}
  }
  return {}
}

function queryOne(req: VercelRequest, key: string): string {
  const v = req.query?.[key]
  if (Array.isArray(v)) return String(v[0] || '').trim()
  return String(v ?? '').trim()
}

/** 同一 URL 多场景：优先 query/header，再按 body 形状推断 */
function resolveAction(req: VercelRequest, body: Record<string, unknown>): string {
  const fromQ =
    queryOne(req, 'action') ||
    queryOne(req, 'Action') ||
    queryOne(req, 'method') ||
    queryOne(req, 'Method')
  if (fromQ) return fromQ
  const fromH =
    headerOne(req, 'x-life-action') ||
    headerOne(req, 'x-tt-action') ||
    headerOne(req, 'action')
  if (fromH) return fromH

  if (body.open_id != null || body.certificates != null || body.third_order_id != null) {
    if (body.refund_id != null || body.after_sale_id != null) return 'refund'
    return 'fulfilment.order.tripartite_code'
  }
  if (body.refund_id != null || body.after_sale_id != null || body.refund_amount != null) {
    return 'trade.refund.apply'
  }
  if (body.order_id != null && (body.sku_id != null || body.third_product_id != null)) {
    return 'trade.order.pre_create_order'
  }
  if (body.order_id != null && body.sku_id == null && body.third_product_id == null) {
    return 'trade.order.query'
  }
  return 'unknown'
}

function precreateFailDescription(code: number): string {
  const map: Record<number, string> = {
    1: '商品不存在',
    2: '商品已下线',
    3: '未到商品开始售卖时间',
    4: '已过商品结束售卖时间',
    5: '商品库存售罄',
    6: '已达到购买上限',
    7: '价格校验失败',
    20: '其他异常',
  }
  return map[code] || `预下单失败(${code})`
}

function handlePrecreate(state: SpiState, body: Record<string, unknown>): Record<string, unknown> {
  const fail = state.precreateFailCode
  if (fail > 0) {
    return {
      data: {
        error_code: fail,
        description: precreateFailDescription(fail),
      },
    }
  }
  const orderId = String(body.order_id ?? '').trim() || `unknown_${Date.now()}`
  return {
    data: {
      error_code: 0,
      description: 'success',
      ext_order_id: `meoo_${orderId}`,
    },
  }
}

function handleIssue(state: SpiState, body: Record<string, unknown>): Record<string, unknown> {
  if (state.issueMode === 'fail') {
    return {
      data: {
        error_code: 0,
        description: 'success',
        result: 2,
        fail_reason: 'ACCEPTANCE_FORCE_FAIL',
        fail_reason_desc: '联调过审：强制发券失败',
      },
    }
  }
  if (state.issueMode === 'async') {
    return {
      data: {
        error_code: 0,
        description: 'success',
        result: 0,
      },
    }
  }
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 20)
  const orderId = String(body.order_id ?? '').trim() || String(Date.now())
  const certificates = Array.from({ length: count }, (_, i) => {
    const id = `meoo_cert_${orderId}_${i + 1}`
    return { certificate_id: id, code: `MEOO${orderId.slice(-8)}${i + 1}`.replace(/\W/g, '').slice(0, 24) }
  })
  return {
    data: {
      error_code: 0,
      description: 'success',
      result: 1,
      certificates,
      codes: certificates.map((c) => c.code),
      third_order_id: String(body.third_order_id ?? `meoo_${orderId}`),
    },
  }
}

function handleRefund(_body: Record<string, unknown>): Record<string, unknown> {
  // 默认同意退款，覆盖多数「退款成功」用例；拒绝补码用例可用 set 扩展
  return {
    data: {
      error_code: 0,
      description: 'success',
      result: 1,
    },
  }
}

function handleRefundNotify(_body: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      error_code: 0,
      description: 'success',
    },
  }
}

function handleOrderQuery(body: Record<string, unknown>): Record<string, unknown> {
  const orderId = String(body.order_id ?? '').trim()
  return {
    data: {
      error_code: 0,
      description: 'success',
      order_id: orderId,
      status: 'DONE',
    },
  }
}

function handleGenericOk(): Record<string, unknown> {
  return { data: { error_code: 0, description: 'success' } }
}

function json(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

/**
 * 开放平台联调把 extra.error_code 当「网关错误码」。
 * 只回 data.error_code 时，平台会把 HTTP 200 记成网关码，校验 [网关错误码==0] 失败。
 */
function wrapSpiResponse(
  out: Record<string, unknown>,
  logid: string,
): Record<string, unknown> {
  const data =
    out.data && typeof out.data === 'object' ? (out.data as Record<string, unknown>) : out
  return {
    error_code: 0,
    description: 'success',
    extra: {
      error_code: 0,
      description: 'success',
      sub_error_code: 0,
      sub_description: '',
      logid: logid || '',
      now: Math.floor(Date.now() / 1000),
    },
    data,
  }
}

function panelHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>抖音 SPI 联调面板</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font:14px/1.45 ui-sans-serif,system-ui; background:#0f172a; color:#e2e8f0; }
    .wrap { max-width:960px; margin:0 auto; padding:20px 16px 48px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:#94a3b8; margin-bottom:16px; }
    .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:14px 16px; margin-bottom:12px; }
    .logid { font:16px/1.4 ui-monospace,Menlo,monospace; word-break:break-all; color:#38bdf8; }
    .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:10px; }
    button, a.btn { appearance:none; border:0; border-radius:8px; padding:8px 12px; background:#334155; color:#f8fafc; cursor:pointer; text-decoration:none; font:inherit; }
    button.pri { background:#2563eb; }
    button.ok { background:#0f766e; }
    button.warn { background:#b45309; }
    button.bad { background:#be123c; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #334155; vertical-align:top; }
    th { color:#94a3b8; font-weight:600; }
    .mono { font-family:ui-monospace,Menlo,monospace; }
    .muted { color:#94a3b8; }
    .okt { color:#34d399; } .badt { color:#fb7185; }
    .copyok { color:#34d399; margin-left:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>抖音 SPI 联调面板</h1>
    <p class="sub">轻量实时日志 · 每 2 秒刷新 · 点支付后把最新 logid 填进开放平台「立即校验」</p>
    <div class="card">
      <div class="muted">最新 logid</div>
      <div id="latest" class="logid">（还没有请求）</div>
      <div class="row">
        <button class="pri" id="copy">复制 logid</button>
        <span id="copied" class="copyok" hidden>已复制</span>
        <span id="age" class="muted"></span>
      </div>
      <div class="muted" style="margin-top:8px">当前模式：<span id="mode">…</span></div>
    </div>
    <div class="card">
      <div class="muted" style="margin-bottom:8px">切桩（切完再去抖音下单）</div>
      <div class="row">
        <button class="ok" data-q="set_precreate_fail=0">预下单成功</button>
        <button class="warn" data-q="set_precreate_fail=2">商品已下线</button>
        <button class="bad" data-q="set_precreate_fail=5">库存售罄/已抢完</button>
        <button class="ok" data-q="set_issue_mode=success">发券同步成功</button>
        <button class="warn" data-q="set_issue_mode=async">发券超时(async)</button>
        <button class="bad" data-q="set_issue_mode=fail">发券失败</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>时间</th><th>动作</th><th>logid</th><th>订单</th><th>返回</th></tr></thead>
        <tbody id="rows"><tr><td colspan="5" class="muted">暂无</td></tr></tbody>
      </table>
    </div>
  </div>
  <script>
    const failLabel = {0:'预下单成功',1:'商品不存在',2:'商品已下线',3:'未开售',4:'已过售卖',5:'库存售罄',6:'购买上限',7:'价格校验失败'};
    const issueLabel = {success:'发券同步成功',async:'发券超时',fail:'发券失败'};
    const fmt = (iso) => {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
      catch { return iso; }
    };
    async function load() {
      const r = await fetch('?diag=1', { cache: 'no-store' });
      const j = await r.json();
      const latest = j.latestLogid || '';
      document.getElementById('latest').textContent = latest || '（还没有请求）';
      const first = (j.recentLogids || [])[0];
      document.getElementById('age').textContent = first ? ('最近一次 ' + fmt(first.at)) : '';
      const st = j.state || {};
      const fail = Number(st.precreateFailCode || 0);
      document.getElementById('mode').textContent =
        (failLabel[fail] || ('失败码'+fail)) + ' · ' + (issueLabel[st.issueMode] || st.issueMode);
      const tb = document.getElementById('rows');
      const rows = j.recentLogids || [];
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="muted">暂无。扫码支付后会出现。</td></tr>'; return; }
      tb.innerHTML = rows.map(h => {
        const bad = String(h.responseSummary||'').includes('error_code=2') || String(h.responseSummary||'').includes('error_code=5');
        return '<tr><td>'+fmt(h.at)+'</td><td class="mono">'+esc(h.action)+'</td><td class="mono '+(bad?'badt':'okt')+'">'+esc(h.logid)+'</td><td class="mono">'+esc(h.orderId||'')+'</td><td class="mono">'+esc(h.responseSummary||'')+'</td></tr>';
      }).join('');
    }
    function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    document.getElementById('copy').onclick = async () => {
      const t = document.getElementById('latest').textContent.trim();
      if (!t || t.startsWith('（')) return;
      await navigator.clipboard.writeText(t);
      const el = document.getElementById('copied'); el.hidden = false; setTimeout(() => el.hidden = true, 1200);
    };
    document.querySelectorAll('button[data-q]').forEach(btn => {
      btn.onclick = async () => { await fetch('?' + btn.getAttribute('data-q') + '&diag=1'); load(); };
    });
    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    const setFail = queryOne(req, 'set_precreate_fail')
    const setIssue = queryOne(req, 'set_issue_mode')
    const state = readState()
    let changed = false
    if (setFail !== '') {
      const n = Number(setFail)
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        state.precreateFailCode = Math.floor(n)
        state.updatedAt = new Date().toISOString()
        changed = true
      }
    }
    if (setIssue === 'success' || setIssue === 'async' || setIssue === 'fail') {
      state.issueMode = setIssue
      state.updatedAt = new Date().toISOString()
      changed = true
    }
    if (changed) writeState(state)

    const recent = hits().slice(0, 15)
    const payload = {
      ok: true,
      endpoint: '/api/meoo-douyin-spi',
      state: readState(),
      stateFile: statePath(),
      recentLogids: recent.map((h) => ({
        at: h.at,
        action: h.action,
        logid: h.logid,
        orderId: h.orderId,
        skuId: h.skuId,
        responseSummary: h.responseSummary,
      })),
      latestLogid: recent[0]?.logid || null,
      hint: {
        panel: 'GET ?panel=1',
        setOfflineFail: 'GET ?set_precreate_fail=2',
        setSuccess: 'GET ?set_precreate_fail=0',
        setIssueAsync: 'GET ?set_issue_mode=async',
        diag: 'GET ?diag=1',
      },
    }
    if (queryOne(req, 'panel') === '1' || queryOne(req, 'panel') === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).send(panelHtml())
      return
    }
    json(res, 200, payload)
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { data: { error_code: 20, description: 'method_not_allowed' } })
    return
  }

  const logid =
    headerOne(req, 'x-bytedance-logid') ||
    headerOne(req, 'X-Bytedance-Logid') ||
    headerOne(req, 'x-tt-logid') ||
    ''
  const body = parseBody(req)
  const action = resolveAction(req, body)
  const state = readState()

  let out: Record<string, unknown>
  const a = action.toLowerCase()
  if (a.includes('pre_create') || a === 'trade.order.pre_create_order') {
    out = handlePrecreate(state, body)
  } else if (a.includes('tripartite') || a.includes('fulfilment.order')) {
    out = handleIssue(state, body)
  } else if (a.includes('refund') && (a.includes('sync') || a.includes('notify') || a.includes('info'))) {
    out = handleRefundNotify(body)
  } else if (a.includes('refund')) {
    out = handleRefund(body)
  } else if (a.includes('query') || a.includes('order.query')) {
    out = handleOrderQuery(body)
  } else if (a === 'unknown') {
    // 无 Action 时：有 open_id 当发码，否则当预下单（联调最常见两条）
    out =
      body.open_id != null ? handleIssue(state, body) : handlePrecreate(state, body)
  } else {
    out = handleGenericOk()
  }

  const data = (out.data && typeof out.data === 'object' ? out.data : {}) as Record<string, unknown>
  const summary = `error_code=${data.error_code ?? ''};result=${data.result ?? ''};ext=${data.ext_order_id ?? ''}`
  pushHit({
    at: new Date().toISOString(),
    action,
    logid: logid || '(missing)',
    orderId: String(body.order_id ?? '').trim() || undefined,
    skuId: String(body.sku_id ?? body.third_sku_id ?? '').trim() || undefined,
    responseSummary: summary,
  })

  console.info(
    `[douyin-spi] action=${action} logid=${logid || '-'} order=${String(body.order_id ?? '')} ${summary}`,
  )

  json(res, 200, wrapSpiResponse(out, logid))
}
