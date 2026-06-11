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
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import { filterLegacyDemoRecruitmentOrders } from '../src/lib/recruitmentLegacyDemoOrders.js'
import type {
  AiVendorCatalogEntry,
  RegistryFile,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistryMpPrUser,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoAi,
  RegistryVideoSubmission,
  RegistryVendorKeys,
} from '../src/lib/opsRegistryTypes.js'
import { upsertMpTalentMember } from '../src/lib/mpTalentMemberUpsert.js'
import { upsertMpPrUser } from '../src/lib/mpPrUserUpsert.js'
import {
  deleteMpRecruitmentOrdersFromSnapshot,
  patchMpRecruitmentOrderInSnapshot,
  type MpRecruitmentPatchBody,
} from '../src/lib/mpRecruitmentOrderRegistryMutations.js'
import {
  patchRecruitmentOrderInSnapshot,
  type RecruitmentOrderPatchBody,
} from '../src/lib/recruitmentOrderPatchMutations.js'
import {
  deleteMpLibraryEntriesFromSnapshot,
  type MpLibraryDeleteKind,
} from '../src/lib/mpLibraryRegistryMutations.js'
import {
  helpManualSliceForEdition,
  setHelpManualForEdition,
} from '../src/lib/helpManualRegistryCore.js'
import {
  getAllHelpManualSeeds,
  getHelpManualSeedForEdition,
  HELP_MANUAL_SEED_VERSION,
} from '../src/lib/helpManualSeedContent.js'
import type { HelpManualEdition } from '../src/lib/helpManualTypes.js'
import { resolveTeamIntro, setTeamIntro } from '../src/lib/teamIntroRegistryCore.js'
import type { RegistryTeamIntro } from '../src/lib/teamIntroTypes.js'
import {
  handleIceMpConfirm,
  isIceMpOrder,
  submitIceDouyinForApplicant,
} from '../src/lib/mpRecruitmentIceCore.js'
import { applyToMpRecruitmentOrderInSnapshot } from '../src/lib/mpRecruitmentApplyCore.js'
import { syncSupplierTeamLibraries, type SupplierTeamRole } from '../src/lib/supplierTeamLibrarySync.js'
import { buildNoviceAllocationFromTalentLibrary } from '../src/lib/talentLibraryTierPricing.js'
import { requireMerchantRegistryAuthFromHeaders } from '../src/lib/merchantRegistryAuth.js'
import {
  appendRecruitmentOrderForTenant,
  filterRegistrySnapshotForMerchant,
  setRecruitmentScheduleRowsForTenant,
  setTalentPoolCandidatesForTenant,
  stripRegistryRecruitmentForAnonymous,
} from '../src/lib/registryTenantIsolation.js'
import { recruitmentOrderBelongsToTenant } from '../src/lib/tenantRegistryScope.js'
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
      mpRecruitmentOrders: [],
      mpTalentMembers: [],
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
          url !== '/api/meoo-ops-recruitment-orders-append' &&
          url !== '/api/meoo-ops-recruitment-orders-patch' &&
          url !== '/api/meoo-ops-mp-talent-inbox-append' &&
          url !== '/api/meoo-ops-mp-recruitment-orders-append' &&
          url !== '/api/meoo-ops-talent-pool-set' &&
          url !== '/api/meoo-ops-recruitment-schedule-set' &&
          url !== '/api/meoo-ops-mp-recruitment-orders-apply' &&
          url !== '/api/meoo-ops-mp-recruitment-orders-patch' &&
          url !== '/api/meoo-ops-mp-recruitment-orders-delete' &&
          url !== '/api/meoo-ops-mp-library-delete' &&
          url !== '/api/meoo-ops-help-manual-set' &&
          url !== '/api/meoo-help-manual-public' &&
          url !== '/api/meoo-help-manual-defaults' &&
          url !== '/api/meoo-ops-team-intro-set' &&
          url !== '/api/meoo-team-intro-public' &&
          url !== '/api/meoo-ops-mp-recruitment-ice-submit' &&
          url !== '/api/meoo-ops-mp-recruitment-ice-confirm' &&
          url !== '/api/meoo-ops-mp-talent-member-register' &&
          url !== '/api/meoo-ops-supplier-team-library-sync' &&
          url !== '/api/meoo-ops-novice-kol-allocation'
        )
          return next()

        const viteRoot = server.config.root
        const method = req.method ?? 'GET'

        const sendCors = () => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        }

        const authHeader =
          typeof req.headers.authorization === 'string'
            ? req.headers.authorization
            : typeof req.headers.Authorization === 'string'
              ? req.headers.Authorization
              : undefined

        if (method === 'OPTIONS') {
          sendCors()
          res.statusCode = 204
          res.end()
          return
        }

        sendCors()

        try {
          if (method === 'GET' && url === '/api/meoo-help-manual-public') {
            const editionRaw = new URL(req.url || '', 'http://local').searchParams.get('edition') || 'merchant'
            const edition = (['merchant', 'partner', 'fulfillment'].includes(String(editionRaw))
              ? editionRaw
              : 'merchant') as HelpManualEdition
            const data = ensureRegistry(viteRoot)
            const slice = helpManualSliceForEdition(data, edition)
            json(res, 200, { ok: true, edition, ...slice })
            return
          }

          if (method === 'GET' && url.startsWith('/api/meoo-help-manual-defaults')) {
            const editionRaw = new URL(req.url || '', 'http://local').searchParams.get('edition') || 'all'
            const raw = String(editionRaw).trim().toLowerCase()
            if (raw === 'all') {
              json(res, 200, { ok: true, version: HELP_MANUAL_SEED_VERSION, editions: getAllHelpManualSeeds() })
              return
            }
            const edition = (['merchant', 'partner', 'fulfillment'].includes(raw) ? raw : 'merchant') as HelpManualEdition
            json(res, 200, { ok: true, version: HELP_MANUAL_SEED_VERSION, edition, ...getHelpManualSeedForEdition(edition) })
            return
          }

          if (method === 'POST' && url === '/api/meoo-ops-help-manual-set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              edition?: HelpManualEdition
              categories?: import('../src/lib/helpManualTypes.js').RegistryHelpManualCategory[]
              articles?: import('../src/lib/helpManualTypes.js').RegistryHelpManualArticle[]
            }
            const edition = body.edition
            if (!edition || !['merchant', 'partner', 'fulfillment'].includes(edition)) {
              json(res, 400, { ok: false, error: 'invalid_edition' })
              return
            }
            const data = ensureRegistry(viteRoot)
            setHelpManualForEdition(
              data,
              edition,
              Array.isArray(body.categories) ? body.categories : [],
              Array.isArray(body.articles) ? body.articles : [],
            )
            writeRegistry(viteRoot, data)
            json(res, 200, {
              ok: true,
              categoryCount: (body.categories ?? []).length,
              articleCount: (body.articles ?? []).length,
            })
            return
          }

          if (method === 'GET' && url === '/api/meoo-team-intro-public') {
            const data = ensureRegistry(viteRoot)
            const intro = resolveTeamIntro(data)
            json(res, 200, { ok: true, intro })
            return
          }

          if (method === 'POST' && url === '/api/meoo-ops-team-intro-set') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { intro?: RegistryTeamIntro }
            const intro = body.intro
            if (!intro || !Array.isArray(intro.paragraphs)) {
              json(res, 400, { ok: false, error: 'invalid_intro' })
              return
            }
            const data = ensureRegistry(viteRoot)
            setTeamIntro(data, intro)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, paragraphCount: intro.paragraphs.length })
            return
          }

          if (method === 'GET' && (url === '/api/ops-sync/registry' || url === '/api/meoo-ops-sync-registry')) {
            let data = ensureRegistry(viteRoot)
            const before = data.recruitmentOrders ?? []
            const cleaned = filterLegacyDemoRecruitmentOrders(before)
            if (cleaned.length !== before.length) {
              data.recruitmentOrders = cleaned
              writeRegistry(viteRoot, data)
            }
            const auth = await requireMerchantRegistryAuthFromHeaders(authHeader)
            if (auth.ok) {
              data = filterRegistrySnapshotForMerchant(auth.tenantId, data)
            } else {
              data = stripRegistryRecruitmentForAnonymous(data)
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
            const { mergeRegistryVideoAiSave } = await import('../src/lib/registryVideoAiNormalize.js')
            data.videoAi = mergeRegistryVideoAiSave(data.videoAi, body.videoAi ?? {})
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
            const merged: RegistryVendorKeys = { ...data.vendorKeys }
            const patch = body.keys && typeof body.keys === 'object' ? body.keys : {}
            for (const [id, v] of Object.entries(patch)) {
              if (!isValidAiVendorSlug(id)) continue
              if (v === undefined) continue
              const t = typeof v === 'string' ? v.trim() : ''
              if (t) merged[id] = t
              else delete merged[id]
            }
            data.vendorKeys = expandVendorKeysForRegistrySave(merged)
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
            const auth = await requireMerchantRegistryAuthFromHeaders(authHeader)
            if (!auth.ok) {
              json(res, auth.status, { ok: false, error: auth.error, message: auth.message })
              return
            }
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { order?: RegistryRecruitmentOrder }
            const order = body.order
            if (!order || !order.id || !order.customerName) {
              json(res, 400, { ok: false, error: 'invalid_order' })
              return
            }
            const reqTid = typeof order.tenantId === 'string' ? order.tenantId.trim() : ''
            if (reqTid && reqTid !== auth.tenantId) {
              json(res, 403, { ok: false, error: 'tenant_mismatch' })
              return
            }
            let data = ensureRegistry(viteRoot)
            const existing = (data.recruitmentOrders ?? []).find((o) => o.id === order.id)
            if (existing && !recruitmentOrderBelongsToTenant(existing, auth.tenantId)) {
              json(res, 403, { ok: false, error: 'forbidden_order' })
              return
            }
            data = appendRecruitmentOrderForTenant(data, order, auth.tenantId, auth.userId)
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

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/recruitment-orders/patch' ||
              url === '/api/meoo-ops-recruitment-orders-patch')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as RecruitmentOrderPatchBody
            const data = ensureRegistry(viteRoot)
            const result = patchRecruitmentOrderInSnapshot(data, body)
            if (!result.ok) {
              json(res, result.status, { ok: false, error: result.error })
              return
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/append' ||
              url === '/api/meoo-ops-mp-recruitment-orders-append')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { order?: RegistryMpRecruitmentOrder }
            const order = body.order
            if (!order || !order.id || !order.sourceMerchantOrderId) {
              json(res, 400, { ok: false, error: 'invalid_mp_order' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const list = [...(data.mpRecruitmentOrders ?? [])]
            const sid = String(order.sourceMerchantOrderId || '').trim()
            const dup = list.find((o) => o && String(o.sourceMerchantOrderId || '').trim() === sid)
            if (dup) {
              json(res, 409, { ok: false, error: 'duplicate_merchant_order', existingId: dup.id })
              return
            }
            list.unshift(order)
            data.mpRecruitmentOrders = list.slice(0, 200)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, id: order.id })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/patch' ||
              url === '/api/meoo-ops-mp-recruitment-orders-patch')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as MpRecruitmentPatchBody
            const data = ensureRegistry(viteRoot)
            const result = patchMpRecruitmentOrderInSnapshot(data, body)
            if (!result.ok) {
              json(res, result.status, { ok: false, error: result.error })
              return
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/delete' ||
              url === '/api/meoo-ops-mp-recruitment-orders-delete')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { id?: string; ids?: string[] }
            const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : []
            const data = ensureRegistry(viteRoot)
            const result = deleteMpRecruitmentOrdersFromSnapshot(data, ids)
            if (!result.ok) {
              json(res, result.status, { ok: false, error: result.error })
              return
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, deletedIds: result.deletedIds })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-library/delete' || url === '/api/meoo-ops-mp-library-delete')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { kind?: MpLibraryDeleteKind; ids?: string[] }
            const kind = body.kind
            if (!kind || !['talent', 'shoot', 'edit', 'pr'].includes(kind)) {
              json(res, 400, { ok: false, error: 'invalid_kind' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const result = deleteMpLibraryEntriesFromSnapshot(data, kind, body.ids ?? [])
            if (!result.ok) {
              json(res, result.status, { ok: false, error: result.error })
              return
            }
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, deletedCount: result.deletedCount })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/apply' ||
              url === '/api/meoo-ops-mp-recruitment-orders-apply')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              mpOrderId?: string
              applicant?: RegistryMpRecruitmentApplicant
            }
            const mpOrderId = (body.mpOrderId ?? '').trim()
            const applicant = body.applicant
            const nick = (applicant?.platformNickname || applicant?.name || '').trim()
            if (!mpOrderId || !applicant || !applicant.id || !nick) {
              json(res, 400, { ok: false, error: 'invalid_apply' })
              return
            }
            applicant.platformNickname = nick
            applicant.name = nick
            const data = ensureRegistry(viteRoot)
            const result = applyToMpRecruitmentOrderInSnapshot(
              data,
              mpOrderId,
              applicant,
              body.workIdentity,
            )
            if (!result.ok) {
              json(res, result.status, {
                ok: false,
                error: result.error,
                code: result.code,
                message: result.message,
              })
              return
            }
            writeRegistry(viteRoot, result.data)
            json(res, 200, result.body)
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/ice-confirm' ||
              url === '/api/meoo-ops-mp-recruitment-ice-confirm')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              mpOrderId?: string
              applicantId?: string
              action?: 'confirm' | 'reject'
            }
            const mpOrderId = (body.mpOrderId ?? '').trim()
            const applicantId = (body.applicantId ?? '').trim()
            const action = body.action === 'reject' ? 'reject' : 'confirm'
            if (!mpOrderId || !applicantId) {
              json(res, 400, { ok: false, error: 'invalid_confirm' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
            if (!data.mpRecruitmentOrders || idx < 0) {
              json(res, 404, { ok: false, error: 'not_found' })
              return
            }
            const cur = data.mpRecruitmentOrders[idx]!
            if (!isIceMpOrder(cur)) {
              json(res, 400, { ok: false, error: 'not_ice_order' })
              return
            }
            const result = handleIceMpConfirm(cur, applicantId, action)
            if (!result.ok) {
              json(res, 409, { ok: false, error: result.code ?? 'confirm_failed', message: result.error })
              return
            }
            data.mpRecruitmentOrders[idx] = result.mp
            writeRegistry(viteRoot, data)
            json(res, 200, result.body)
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/mp-recruitment-orders/ice-submit' ||
              url === '/api/meoo-ops-mp-recruitment-ice-submit')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              mpOrderId?: string
              applicantId?: string
              douyinPublishUrl?: string
            }
            const mpOrderId = (body.mpOrderId ?? '').trim()
            const applicantId = (body.applicantId ?? '').trim()
            const douyinPublishUrl = (body.douyinPublishUrl ?? '').trim()
            if (!mpOrderId || !applicantId || !douyinPublishUrl) {
              json(res, 400, { ok: false, error: 'invalid_submit' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
            if (!data.mpRecruitmentOrders || idx < 0) {
              json(res, 404, { ok: false, error: 'not_found' })
              return
            }
            const cur = data.mpRecruitmentOrders[idx]!
            if (!isIceMpOrder(cur)) {
              json(res, 400, { ok: false, error: 'not_ice_order' })
              return
            }
            const result = await submitIceDouyinForApplicant(cur, applicantId, douyinPublishUrl, process.env as Record<string, string>)
            if (!result.ok) {
              json(res, 400, { ok: false, error: 'verify_failed', message: result.error })
              return
            }
            data.mpRecruitmentOrders[idx] = result.mp
            writeRegistry(viteRoot, data)
            json(res, 200, {
              ok: true,
              status: result.mp.status,
              aiVerifyStatus: result.aiVerifyStatus,
              message: result.message,
            })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/mp-talent-members/register') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { member?: RegistryMpTalentMember }
            const member = body.member
            if (!member || !member.memberType || !String(member.wxNickName || '').trim()) {
              json(res, 400, { ok: false, error: 'invalid_member' })
              return
            }
            if (!String(member.contact || '').trim() || !String(member.wechatId || '').trim()) {
              json(res, 400, { ok: false, error: 'contact_required' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const saved = upsertMpTalentMember(data, member)
            writeRegistry(viteRoot, data)
            json(res, 200, {
              ok: true,
              id: saved.id,
              lingqiTalentId: saved.lingqiTalentId || null,
            })
            return
          }

          if (method === 'POST' && url === '/api/ops-sync/mp-pr-users/register') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { prUser?: RegistryMpPrUser }
            const prUser = body.prUser
            if (!prUser || !prUser.accountType) {
              json(res, 400, { ok: false, error: 'invalid_pr_user' })
              return
            }
            const org =
              prUser.accountType === 'personal'
                ? String(prUser.personalName || '').trim()
                : String(prUser.companyName || '').trim()
            if (!org) {
              json(res, 400, { ok: false, error: 'org_required' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const saved = upsertMpPrUser(data, prUser)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, id: saved.id, lingqiPrId: saved.lingqiPrId })
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

          if (
            method === 'POST' &&
            url === '/api/meoo-ops-novice-kol-allocation'
          ) {
            const auth = await requireMerchantRegistryAuthFromHeaders(authHeader)
            if (!auth.ok) {
              json(res, auth.status, { ok: false, error: auth.error, message: auth.message })
              return
            }
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as {
              city?: string
              budgetYuan?: number
              targetHeadcount?: number
              feeType?: 'tier' | 'fixed'
              platform?: string
            }
            const city = String(body.city ?? '').trim()
            const budgetYuan = Number(body.budgetYuan)
            const targetHeadcount = Number(body.targetHeadcount)
            const feeType = body.feeType === 'fixed' ? 'fixed' : 'tier'
            if (!city) {
              json(res, 400, { ok: false, error: 'city_required' })
              return
            }
            if (!Number.isFinite(budgetYuan) || budgetYuan <= 0) {
              json(res, 400, { ok: false, error: 'invalid_budget' })
              return
            }
            if (!Number.isFinite(targetHeadcount) || targetHeadcount < 1) {
              json(res, 400, { ok: false, error: 'invalid_headcount' })
              return
            }
            const data = ensureRegistry(viteRoot)
            const platformRaw = String(body.platform ?? '抖音').trim()
            const platform =
              platformRaw === '小红书' ||
              platformRaw === '大众点评' ||
              platformRaw === '快手' ||
              platformRaw === '微信视频号'
                ? platformRaw
                : '抖音'
            const allocation = buildNoviceAllocationFromTalentLibrary({
              entries: data.talentLibraryEntries ?? [],
              city,
              budgetYuan,
              targetHeadcount,
              feeType,
              platform,
            })
            const { pricingContext, ...publicAllocation } = allocation
            json(res, 200, {
              ok: true,
              allocation: publicAllocation,
              pricing: pricingContext
                ? {
                    priceSource: pricingContext.priceSource,
                    matchedEntries: pricingContext.matchedEntries,
                    filterCity: pricingContext.filterCity,
                    filterPlatform: pricingContext.filterPlatform,
                    tierAvgs: pricingContext.tierAvgs,
                  }
                : undefined,
            })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/talent-pool/set' || url === '/api/meoo-ops-talent-pool-set')
          ) {
            const auth = await requireMerchantRegistryAuthFromHeaders(authHeader)
            if (!auth.ok) {
              json(res, auth.status, { ok: false, error: auth.error, message: auth.message })
              return
            }
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { candidates?: RegistryTalentPoolRow[] }
            const candidates = Array.isArray(body.candidates) ? body.candidates : []
            let data = ensureRegistry(viteRoot)
            data = setTalentPoolCandidatesForTenant(data, auth.tenantId, candidates)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true })
            return
          }

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/recruitment-schedule/set' ||
              url === '/api/meoo-ops-recruitment-schedule-set')
          ) {
            const auth = await requireMerchantRegistryAuthFromHeaders(authHeader)
            if (!auth.ok) {
              json(res, auth.status, { ok: false, error: auth.error, message: auth.message })
              return
            }
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { rows?: RegistryScheduleRow[] }
            const rows = Array.isArray(body.rows) ? body.rows : []
            let data = ensureRegistry(viteRoot)
            data = setRecruitmentScheduleRowsForTenant(data, auth.tenantId, rows)
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

          if (
            method === 'POST' &&
            (url === '/api/ops-sync/supplier-team-library/sync' ||
              url === '/api/meoo-ops-supplier-team-library-sync')
          ) {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { role?: string }
            const roleRaw = String(body.role || 'all').trim()
            const roles: SupplierTeamRole[] =
              roleRaw === 'shoot' ? ['shoot'] : roleRaw === 'edit' ? ['edit'] : ['shoot', 'edit']
            const data = ensureRegistry(viteRoot)
            const counts = syncSupplierTeamLibraries(data, roles)
            writeRegistry(viteRoot, data)
            json(res, 200, { ok: true, ...counts })
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
