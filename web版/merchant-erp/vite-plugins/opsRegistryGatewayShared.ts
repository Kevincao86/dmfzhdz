/**
 * dev 共享注册表 HTTP 网关（GET/POST /api/ops-sync/*）。
 * 注册表目录由调用方传入，使 ERP 与管理后台写入同一文件（项目根 .meoo-dev-sync）。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { isValidAiVendorSlug, mergeBuiltinAiVendorCatalog } from '../src/lib/aiVendorCatalogShared.js'
import { filterLegacyDemoRecruitmentOrders } from '../src/lib/recruitmentLegacyDemoOrders.js'
import type {
  AiVendorCatalogEntry,
  RegistryFile,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoAi,
  RegistryVideoSubmission,
  RegistryVendorKeys,
} from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import { DEFAULT_AI, normalizeRegistryFile, registryForPersistentFile } from './opsRegistryGatewayCore.js'

export { DEFAULT_AI, normalizeRegistryFile, registryForPersistentFile } from './opsRegistryGatewayCore.js'

export type OpsRegistryGatewayOptions = {
  registryDir: (viteProjectRoot: string) => string
  legacyRegistryFile?: (viteProjectRoot: string) => string | null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sha256Hex(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function createOpsRegistryGatewayPlugin(opts: OpsRegistryGatewayOptions): Plugin {
  const registryPath = (viteRoot: string) => path.join(opts.registryDir(viteRoot), 'registry.json')

  function maybeMigrateLegacy(viteRoot: string) {
    const legacyPath = opts.legacyRegistryFile?.(viteRoot)
    if (!legacyPath || !fs.existsSync(legacyPath)) return
    const dir = opts.registryDir(viteRoot)
    const next = registryPath(viteRoot)
    if (fs.existsSync(next)) return
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    try {
      fs.copyFileSync(legacyPath, next)
    } catch {
      /* ignore */
    }
  }

  function writeRegistryDisk(viteRoot: string, data: RegistryFile) {
    const dir = opts.registryDir(viteRoot)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(registryPath(viteRoot), JSON.stringify(registryForPersistentFile(data), null, 2), 'utf8')
  }

  function blankRegistryParsed(): Partial<RegistryFile> {
    return {
      tenants: [],
      aiModels: { ...DEFAULT_AI, updatedAt: new Date().toISOString(), controlledByOps: false },
      aiVendorCatalog: [],
      vendorKeys: {},
      vendorKeysUpdatedAt: new Date(0).toISOString(),
      vendorKeysWriter: 'erp',
      recruitmentOrders: [],
      talentPoolCandidates: [],
      recruitmentScheduleRows: [],
      recruitmentVideoSubmissions: [],
      videoAi: {},
      videoAiUpdatedAt: new Date(0).toISOString(),
      videoAiWriter: 'erp',
    }
  }

  function ensureRegistry(viteRoot: string): RegistryFile {
    maybeMigrateLegacy(viteRoot)
    const dir = opts.registryDir(viteRoot)
    const p = registryPath(viteRoot)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(p)) {
      const n = normalizeRegistryFile(blankRegistryParsed())
      writeRegistryDisk(viteRoot, n)
      return n
    }
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const parsed = JSON.parse(raw) as Partial<RegistryFile> | null
      return normalizeRegistryFile(parsed)
    } catch {
      const n = normalizeRegistryFile(blankRegistryParsed())
      writeRegistryDisk(viteRoot, n)
      return n
    }
  }

  function writeRegistry(viteRoot: string, data: RegistryFile) {
    writeRegistryDisk(viteRoot, data)
  }

  return {
    name: 'ops-registry-gateway',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (
          !url.startsWith('/api/ops-sync') &&
          url !== '/api/meoo-ops-sync-registry' &&
          url !== '/api/meoo-ops-recruitment-orders-append'
        )
          return next()

        const viteRoot = server.config.root
        const method = req.method ?? 'GET'

        const sendCors = () => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        }

        if (method === 'OPTIONS') {
          sendCors()
          res.statusCode = 204
          res.end()
          return
        }

        sendCors()

        try {
          if (method === 'GET' && (url === '/api/ops-sync/registry' || url === '/api/meoo-ops-sync-registry')) {
            const data = ensureRegistry(viteRoot)
            const before = data.recruitmentOrders ?? []
            const cleaned = filterLegacyDemoRecruitmentOrders(before)
            if (cleaned.length !== before.length) {
              data.recruitmentOrders = cleaned
              writeRegistry(viteRoot, data)
            }
            json(res, 200, data)
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/tenants/erp') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { tenant?: RegistryTenant }
            const tenant = body.tenant
            if (!tenant || !tenant.id || !tenant.loginName) {
              json(res, 400, { ok: false, error: 'invalid_tenant' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const nextTenants = data.tenants.filter((t) => t.id !== tenant.id)
            nextTenants.push({
              ...tenant,
              source: 'erp',
              updatedAt: new Date().toISOString(),
            })
            data.tenants = nextTenants
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/tenants/manual') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              loginName?: string
              password?: string
              merchantName?: string
              trialDays?: number
              officialDays?: number
              industry?: string
            }
            const loginName = (body.loginName ?? '').trim()
            const password = body.password ?? ''
            const merchantName = (body.merchantName ?? '').trim()
            const trialDays = Math.max(0, Math.min(3650, Number(body.trialDays) || 0))
            const officialDays = Math.max(0, Math.min(36500, Number(body.officialDays) || 0))
            const industry = (body.industry ?? '综合服务').trim() || '综合服务'
            if (loginName.length < 2 || password.length < 6 || merchantName.length < 1) {
              json(res, 400, { ok: false, error: 'invalid_fields' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const lnKey = loginName.toLowerCase()
            if (data.tenants.some((t) => (t.loginName ?? '').trim().toLowerCase() === lnKey)) {
              json(res, 409, { ok: false, error: 'login_exists' })
              return
            }
            const now = new Date()
            const id = `ops-${now.getTime()}`
            const passwordHash = sha256Hex(password)
            const trialEnds = new Date(now)
            trialEnds.setDate(trialEnds.getDate() + trialDays)
            const officialEnds = new Date(trialEnds)
            officialEnds.setDate(officialEnds.getDate() + officialDays)
            const row: RegistryTenant = {
              id,
              source: 'ops_manual',
              loginName,
              passwordHash,
              merchantName,
              industry,
              registeredAt: now.toISOString(),
              accountStatus: 'normal',
              trialDays,
              officialDays,
              trialEndsAt: trialDays > 0 ? trialEnds.toISOString() : undefined,
              officialEndsAt: officialDays > 0 ? officialEnds.toISOString() : undefined,
              updatedAt: now.toISOString(),
            }
            data.tenants.push(row)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, id })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/ai') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              textModel?: string
              imageModel?: string
              lastWriter?: 'erp' | 'ops'
            }
            const rawT = (body.textModel ?? '').trim().toLowerCase()
            const rawI = (body.imageModel ?? '').trim().toLowerCase()
            const textModel = !rawT || rawT === 'auto' ? 'auto' : rawT
            const imageModel = !rawI || rawI === 'auto' ? 'auto' : rawI
            const lastWriter = body.lastWriter === 'ops' ? 'ops' : 'erp'
            const data = ensureRegistry(viteRoot)
            const controlledByOps = lastWriter === 'ops' ? true : data.aiModels.controlledByOps
            data.aiModels = {
              textModel,
              imageModel,
              updatedAt: new Date().toISOString(),
              lastWriter,
              controlledByOps,
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/video-ai') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              videoAi?: RegistryVideoAi
              lastWriter?: 'erp' | 'ops'
            }
            const lastWriter = body.lastWriter === 'erp' ? 'erp' : 'ops'
            const data = ensureRegistry(viteRoot)
            const nextAi = normalizeRegistryVideoAi(body.videoAi ?? {})
            data.videoAi = Object.keys(nextAi).length > 0 ? nextAi : {}
            data.videoAiUpdatedAt = new Date().toISOString()
            data.videoAiWriter = lastWriter
            if (lastWriter === 'ops') {
              data.aiModels = {
                ...data.aiModels,
                controlledByOps: true,
                updatedAt: new Date().toISOString(),
                lastWriter: 'ops',
              }
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/vendor-keys') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              keys?: RegistryVendorKeys
              aiVendorCatalog?: AiVendorCatalogEntry[]
              lastWriter?: 'erp' | 'ops'
            }
            const lastWriter = body.lastWriter === 'erp' ? 'erp' : 'ops'
            const data = ensureRegistry(viteRoot)
            const next: RegistryVendorKeys = { ...data.vendorKeys }
            const patch = body.keys && typeof body.keys === 'object' ? body.keys : {}
            for (const [id, v] of Object.entries(patch)) {
              if (!isValidAiVendorSlug(id)) continue
              if (v === undefined) continue
              const t = typeof v === 'string' ? v.trim() : ''
              if (t) next[id] = t
              else delete next[id]
            }
            data.vendorKeys = next
            if (body.aiVendorCatalog !== undefined) {
              data.aiVendorCatalog = mergeBuiltinAiVendorCatalog(
                Array.isArray(body.aiVendorCatalog) ? body.aiVendorCatalog : [],
              )
            }
            data.vendorKeysUpdatedAt = new Date().toISOString()
            data.vendorKeysWriter = lastWriter
            if (lastWriter === 'ops') {
              data.aiModels = {
                ...data.aiModels,
                controlledByOps: true,
                updatedAt: new Date().toISOString(),
                lastWriter: 'ops',
              }
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/tenants/patch') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              id?: string
              merchantName?: string
              industry?: string
              accountStatus?: RegistryTenant['accountStatus']
              trialDays?: number
              officialDays?: number
              password?: string
            }
            const id = (body.id ?? '').trim()
            if (!id) {
              json(res, 400, { ok: false, error: 'missing_id' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const idx = data.tenants.findIndex((t) => t.id === id)
            if (idx < 0) {
              json(res, 404, { ok: false, error: 'not_found' })
              return
            }
            const cur = data.tenants[idx]!
            if (typeof body.merchantName === 'string' && body.merchantName.trim()) cur.merchantName = body.merchantName.trim()
            if (typeof body.industry === 'string' && body.industry.trim()) cur.industry = body.industry.trim()
            if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
              cur.accountStatus = body.accountStatus
            }
            if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
              cur.trialDays = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
            }
            if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
              cur.officialDays = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
            }
            if (typeof body.password === 'string' && body.password.length >= 6) {
              cur.passwordHash = sha256Hex(body.password)
            }
            const base = new Date(cur.registeredAt || Date.now())
            if (cur.trialDays > 0) {
              const te = new Date(base)
              te.setDate(te.getDate() + cur.trialDays)
              cur.trialEndsAt = te.toISOString()
            } else {
              cur.trialEndsAt = undefined
            }
            if (cur.officialDays > 0) {
              const start = cur.trialEndsAt ? new Date(cur.trialEndsAt) : new Date(base)
              const oe = new Date(start)
              oe.setDate(oe.getDate() + cur.officialDays)
              cur.officialEndsAt = oe.toISOString()
            } else {
              cur.officialEndsAt = undefined
            }
            cur.updatedAt = new Date().toISOString()
            data.tenants[idx] = cur
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/recruitment-orders/append' || url === '/api/meoo-ops-recruitment-orders-append')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { order?: RegistryRecruitmentOrder }
            const order = body.order
            if (!order || !order.id || !order.customerName) {
              json(res, 400, { ok: false, error: 'invalid_order' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const list = [...(data.recruitmentOrders ?? [])]
            list.unshift(order)
            data.recruitmentOrders = list.slice(0, 200)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/recruitment-orders/set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { orders?: RegistryRecruitmentOrder[] }
            const orders = Array.isArray(body.orders) ? body.orders : []
            const data = ensureRegistry(viteRoot)
            data.recruitmentOrders = orders.slice(0, 200)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/recruitment-orders/patch') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              id?: string
              status?: RegistryRecruitmentOrder['status']
            }
            const id = (body.id ?? '').trim()
            const status = body.status
            if (!id) {
              json(res, 400, { ok: false, error: 'invalid_patch' })
              return
            }
            const okStatus =
              status === 'pending' ||
              status === 'accepted' ||
              status === 'done' ||
              status === 'cancelled' ||
              status === 'refunded'
            if (!okStatus) {
              json(res, 400, { ok: false, error: 'invalid_patch' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const idx = data.recruitmentOrders?.findIndex((o) => o.id === id) ?? -1
            if (!data.recruitmentOrders || idx < 0) {
              json(res, 404, { ok: false, error: 'not_found' })
              return
            }
            data.recruitmentOrders[idx] = { ...data.recruitmentOrders[idx]!, status }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/talent-pool/append') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { candidates?: RegistryTalentPoolRow[] }
            const candidates = Array.isArray(body.candidates) ? body.candidates : []
            const data = ensureRegistry(viteRoot)
            const list = [...(data.talentPoolCandidates ?? [])]
            for (const c of [...candidates].reverse()) list.unshift(c)
            data.talentPoolCandidates = list.slice(0, 240)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/talent-pool/set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { candidates?: RegistryTalentPoolRow[] }
            const candidates = Array.isArray(body.candidates) ? body.candidates : []
            const data = ensureRegistry(viteRoot)
            data.talentPoolCandidates = candidates.slice(0, 240)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/recruitment-schedule/set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { rows?: RegistryScheduleRow[] }
            const rows = Array.isArray(body.rows) ? body.rows : []
            const data = ensureRegistry(viteRoot)
            data.recruitmentScheduleRows = rows.slice(0, 400)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/recruitment-videos/set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { videos?: RegistryVideoSubmission[] }
            const videos = Array.isArray(body.videos) ? body.videos : []
            const data = ensureRegistry(viteRoot)
            data.recruitmentVideoSubmissions = videos.slice(0, 400)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          json(res, 404, { ok: false, error: 'not_found', path: url })
          return
        } catch {
          json(res, 502, { ok: false, error: 'ops_sync_failed' })
        }
      })
    },
  }
}
