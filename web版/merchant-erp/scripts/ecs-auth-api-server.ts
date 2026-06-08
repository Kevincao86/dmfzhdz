/**
 * ECS 本机 API（Auth + 运营客服轮询），供 Nginx 反代 /erp-api/
 */
/** 避免 loadRegistrySnapshotForServer 经 erp-api 回环自调导致 pending/502 */
process.env.MEOO_AUTH_API_SERVER = '1'

import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import registerHandler from '../api/meoo-auth-register.ts'
import smsSendHandler from '../api/meoo-auth-sms-send.ts'
import smsVerifyHandler from '../api/meoo-auth-sms-verify.ts'
import smsLoginHandler from '../api/meoo-auth-sms-login.ts'
import pingHandler from '../api/meoo-auth-ping.ts'
import supportPollHandler from '../../../商家管理后台/api/support-poll.ts'
import supportOpsSendHandler from '../../../商家管理后台/api/support-ops-send.ts'
import tenantsListHandler from '../../../商家管理后台/api/meoo-supabase-tenants-list.ts'
import tenantsPatchHandler from '../../../商家管理后台/api/meoo-supabase-tenants-patch.ts'
import tenantsResetPwdHandler from '../../../商家管理后台/api/meoo-supabase-tenants-reset-password.ts'
import tenantsDeleteHandler from '../../../商家管理后台/api/meoo-supabase-tenants-delete.ts'
import paymentOrdersListHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-list.ts'
import paymentOrdersVerifyHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-verify.ts'
import paymentOrdersConfirmHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-confirm.ts'
import opsSyncRegistryGetHandler from '../api/meoo-ops-registry-ops-get.ts'
import opsSyncVendorKeysHandler from '../api/meoo-ops-sync-vendor-keys.ts'
import opsSyncAiHandler from '../api/meoo-ops-sync-ai.ts'
import opsSyncVideoAiHandler from '../api/meoo-ops-sync-video-ai.ts'
import opsRegistryTenantDeleteHandler from '../api/meoo-ops-registry-tenant-delete.ts'
import meooAiChatHandler from '../api/meoo-ai-chat.ts'
import meooAiVendorKeysDiagHandler from '../api/meoo-ai-vendor-keys-diag.ts'
import meooAiVendorKeysProbeHandler from '../api/meoo-ai-vendor-keys-probe.ts'
import meooAiAgentImageHandler from '../api/meoo-ai-agent-image.ts'
import agentDailyInfoHandler from '../api/meoo-agent-daily-info.ts'
import videoConfigHandler from '../api/meoo-merchant-ai-video-config.ts'
import klingStartHandler from '../api/meoo-merchant-ai-video-kling-start.ts'
import klingStatusHandler from '../api/meoo-merchant-ai-video-kling-status.ts'
import seedanceStartHandler from '../api/meoo-merchant-ai-video-seedance-start.ts'
import seedanceStatusHandler from '../api/meoo-merchant-ai-video-seedance-status.ts'
import videoLongformPlanHandler from '../api/meoo-merchant-ai-video-longform-plan.ts'
import videoDownloadUrlHandler from '../api/meoo-merchant-ai-video-download-url.ts'
import videoConcatUrlsHandler from '../api/meoo-merchant-ai-video-concat-urls.ts'
import videoConcatBlobsHandler from '../api/meoo-merchant-ai-video-concat-blobs.ts'
import douyinGoodsAiAssistHandler from '../api/meoo-douyin-goods-ai-assist.ts'
import iceConfigHandler from '../api/meoo-merchant-ai-video-ice-config.ts'
import iceOpenshotConfigHandler from '../api/meoo-merchant-ai-video-openshot-config.ts'
import iceUploadInitHandler from '../api/meoo-merchant-ai-video-ice-upload-init.ts'
import iceUploadHandler from '../api/meoo-merchant-ai-video-ice-upload.ts'
import iceMultipartHandler from '../api/meoo-merchant-ai-video-ice-multipart.ts'
import icePipelineHandler from '../api/meoo-merchant-ai-video-ice-pipeline.ts'
import iceOpenshotPipelineHandler from '../api/meoo-merchant-ai-video-openshot-pipeline.ts'
import iceJobHandler from '../api/meoo-merchant-ai-video-ice-job.ts'
import iceJobDownloadHandler from '../api/meoo-merchant-ai-video-ice-job-download.ts'
import iceOpenshotExportDownloadHandler from '../api/meoo-merchant-ai-video-openshot-export-download.ts'
import iceOpenshotExportHandler from '../api/meoo-merchant-ai-video-openshot-export.ts'
import digitalHumanTtsHandler from '../api/meoo-digital-human-tts.ts'
import digitalHumanDouyinLinkHandler from '../api/meoo-digital-human-douyin-link.ts'
import recruitmentOrdersPatchHandler from '../api/meoo-ops-recruitment-orders-patch.ts'
import mpRecruitmentApplyHandler from '../api/meoo-ops-mp-recruitment-orders-apply.ts'
import mpRecruitmentAppendHandler from '../api/meoo-ops-mp-recruitment-orders-append.ts'
import mpRecruitmentPatchHandler from '../api/meoo-ops-mp-recruitment-orders-patch.ts'
import mpRecruitmentDeleteHandler from '../api/meoo-ops-mp-recruitment-orders-delete.ts'
import mpLibraryDeleteHandler from '../api/meoo-ops-mp-library-delete.ts'
import helpManualPublicHandler from '../api/meoo-help-manual-public.ts'
import helpManualSetHandler from '../api/meoo-ops-help-manual-set.ts'
import mpTalentMemberRegisterHandler from '../api/meoo-ops-mp-talent-member-register.ts'
import mpPrUserRegisterHandler from '../api/meoo-ops-mp-pr-user-register.ts'
import mpTalentChatHandler from '../api/meoo-ops-mp-talent-chat.ts'
import mpSupportRelayHandler from '../api/meoo-ops-mp-support-relay.ts'
import mpRecruitmentIceSubmitHandler from '../api/meoo-ops-mp-recruitment-ice-submit.ts'
import mpRecruitmentIceConfirmHandler from '../api/meoo-ops-mp-recruitment-ice-confirm.ts'
import mpRecruitmentVideoUploadInitHandler from '../api/meoo-ops-mp-recruitment-video-upload-init.ts'
import mpRecruitmentVideoUploadBodyHandler from '../api/meoo-ops-mp-recruitment-video-upload-body.ts'
import mpRecruitmentVideoSubmitHandler from '../api/meoo-ops-mp-recruitment-video-submit.ts'
import mpRecruitmentVideoReviewHandler from '../api/meoo-ops-mp-recruitment-video-review.ts'
import mpTalentInboxAppendHandler from '../api/meoo-ops-mp-talent-inbox-append.ts'
import mpGroupQrPurgeHandler from '../api/meoo-ops-mp-group-qr-purge.ts'
import mpRecruitmentAiHandler from '../api/meoo-mp-recruitment-ai.ts'
import mpProfileLinkParseHandler from '../api/meoo-ops-mp-profile-link-parse.ts'
import mpHallRegistryHandler from '../api/meoo-ops-mp-hall-registry.ts'
import mpAuthHandler from '../api/meoo-ops-mp-auth.ts'
import douyinBindHandler from '../api/douyin-bind.ts'
import kuaishouBindHandler from '../api/kuaishou-bind.ts'
import apiPingHandler from '../api/ping.ts'
import merchantSlugHandler from '../api/merchant/[...slug].ts'

/** 404 响应中带此字段，便于确认 ECS 是否已拉取含注册表路由的版本 */
export const ECS_AUTH_API_ROUTE_REVISION = '20260601-registry-no-loop-ice-ram'

const PORT = Number(process.env.AUTH_API_PORT ?? 3001)

type VercelLikeHandler = (
  req: IncomingMessage & {
    method?: string
    url?: string
    body?: unknown
    query?: Record<string, string | string[]>
    headers?: IncomingMessage['headers']
  },
  res: ServerResponse,
) => Promise<void>

const routes: Record<string, VercelLikeHandler> = {
  '/api/meoo-auth-register': registerHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-send': smsSendHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-verify': smsVerifyHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-login': smsLoginHandler as VercelLikeHandler,
  '/api/meoo-auth-ping': pingHandler as VercelLikeHandler,
  '/api/support-poll': supportPollHandler as VercelLikeHandler,
  '/api/support-ops-send': supportOpsSendHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-list': tenantsListHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-patch': tenantsPatchHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-reset-password': tenantsResetPwdHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-delete': tenantsDeleteHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-list': paymentOrdersListHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-verify': paymentOrdersVerifyHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-confirm': paymentOrdersConfirmHandler as VercelLikeHandler,
  /** 运营台注册表：Vercel 无法出站访问 ECS Supabase，由浏览器经 /erp-api 直连本机 */
  '/api/meoo-ops-sync-registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-hall-registry': mpHallRegistryHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-auth': mpAuthHandler as VercelLikeHandler,
  '/api/ops-sync/registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/ops-sync/vendor-keys': opsSyncVendorKeysHandler as VercelLikeHandler,
  '/api/ops-sync/ai': opsSyncAiHandler as VercelLikeHandler,
  '/api/ops-sync/video-ai': opsSyncVideoAiHandler as VercelLikeHandler,
  '/api/meoo-ops-registry-tenant-delete': opsRegistryTenantDeleteHandler as VercelLikeHandler,
  '/api/ops-sync/tenants/delete': opsRegistryTenantDeleteHandler as VercelLikeHandler,
  '/api/meoo-ai-chat': meooAiChatHandler as VercelLikeHandler,
  '/api/meoo-ai-vendor-keys-diag': meooAiVendorKeysDiagHandler as VercelLikeHandler,
  '/api/meoo-ai-vendor-keys-probe': meooAiVendorKeysProbeHandler as VercelLikeHandler,
  '/api/meoo-ai-agent-image': meooAiAgentImageHandler as VercelLikeHandler,
  '/api/meoo-agent-daily-info': agentDailyInfoHandler as VercelLikeHandler,
  /** 数字人口播：MiniMax 神经 TTS 试听、抖音链接文案（须合并运营台 vendorKeys） */
  '/api/meoo-digital-human-tts': digitalHumanTtsHandler as VercelLikeHandler,
  '/api/meoo-digital-human-douyin-link': digitalHumanDouyinLinkHandler as VercelLikeHandler,
  /** 短视频 AI（可灵 / 方舟 Seedance / 长片策划）：履约增值服务嵌入须走 ECS */
  '/api/meoo-merchant-ai-video-config': videoConfigHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-kling-start': klingStartHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-kling-status': klingStatusHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-seedance-start': seedanceStartHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-seedance-status': seedanceStatusHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-longform-plan': videoLongformPlanHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-download-url': videoDownloadUrlHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-concat-urls': videoConcatUrlsHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-concat-blobs': videoConcatBlobsHandler as VercelLikeHandler,
  /** AI 文章与话题（抖音来客文案） */
  '/api/meoo-douyin-goods-ai-assist': douyinGoodsAiAssistHandler as VercelLikeHandler,
  /** 灵祺AI云剪：读运营台 videoAi 注册表，须走 ECS 勿仅靠 Vercel */
  '/api/meoo-merchant-ai-video-ice-config': iceConfigHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-openshot-config': iceOpenshotConfigHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-upload-init': iceUploadInitHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-upload': iceUploadHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-multipart': iceMultipartHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-pipeline': icePipelineHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-openshot-pipeline': iceOpenshotPipelineHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-job': iceJobHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-openshot-export': iceOpenshotExportHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-ice-job-download': iceJobDownloadHandler as VercelLikeHandler,
  '/api/meoo-merchant-ai-video-openshot-export-download':
    iceOpenshotExportDownloadHandler as VercelLikeHandler,
  /** 灵祺达人招募小程序（与 Vercel 根 api/ 同名路由） */
  '/api/meoo-ops-recruitment-orders-patch': recruitmentOrdersPatchHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-apply': mpRecruitmentApplyHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-append': mpRecruitmentAppendHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-patch': mpRecruitmentPatchHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-delete': mpRecruitmentDeleteHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-library-delete': mpLibraryDeleteHandler as VercelLikeHandler,
  '/api/meoo-help-manual-public': helpManualPublicHandler as VercelLikeHandler,
  '/api/meoo-ops-help-manual-set': helpManualSetHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-member-register': mpTalentMemberRegisterHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-pr-user-register': mpPrUserRegisterHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-chat': mpTalentChatHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-support-relay': mpSupportRelayHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-ice-submit': mpRecruitmentIceSubmitHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-ice-confirm': mpRecruitmentIceConfirmHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-video-upload-init': mpRecruitmentVideoUploadInitHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-video-upload-body': mpRecruitmentVideoUploadBodyHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-video-submit': mpRecruitmentVideoSubmitHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-video-review': mpRecruitmentVideoReviewHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-inbox-append': mpTalentInboxAppendHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-group-qr-purge': mpGroupQrPurgeHandler as VercelLikeHandler,
  '/api/meoo-mp-recruitment-ai': mpRecruitmentAiHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-profile-link-parse': mpProfileLinkParseHandler as VercelLikeHandler,
  '/api/douyin-bind': douyinBindHandler as VercelLikeHandler,
  '/api/meoo-douyin-bind': douyinBindHandler as VercelLikeHandler,
  '/api/merchant/douyin/bind': douyinBindHandler as VercelLikeHandler,
  '/api/kuaishou-bind': kuaishouBindHandler as VercelLikeHandler,
  '/api/meoo-kuaishou-bind': kuaishouBindHandler as VercelLikeHandler,
  '/api/ping': apiPingHandler as VercelLikeHandler,
  '/api/meoo-erp-api-health': async (_req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        ok: true,
        revision: ECS_AUTH_API_ROUTE_REVISION,
        routes: Object.keys(routes).length,
      }),
    )
  },
  /** 微信 Cronet / Safari 探活：/erp-api/mp-cronet-ping → /api/mp-cronet-ping */
  '/api/mp-cronet-ping': async (_req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(
      JSON.stringify({
        ok: true,
        via: 'auth-api',
        revision: ECS_AUTH_API_ROUTE_REVISION,
      }),
    )
  },
  // tokenmix 依赖 @supabase/supabase-js（须在 商家管理后台/node_modules）；ECS 仅走 Vercel /api/meoo-supabase-tenants-tokenmix
}

const dynamicHandlerCache = new Map<string, VercelLikeHandler>()

/** ECS 迁移：Vercel 上 api/*.ts 自动成路由；轻量 auth-api 需动态加载或 merchant 网关 */
async function resolveHandler(path: string): Promise<VercelLikeHandler | null> {
  const exact = routes[path]
  if (exact) return exact

  if (path.startsWith('/api/merchant/')) {
    return merchantSlugHandler as VercelLikeHandler
  }

  const rel = path.slice('/api/'.length)
  if (!rel || rel.includes('/') || !/^[\w-]+$/.test(rel)) return null

  const cached = dynamicHandlerCache.get(path)
  if (cached) return cached

  try {
    const mod = (await import(`../api/${rel}.ts`)) as { default?: VercelLikeHandler }
    if (typeof mod.default === 'function') {
      dynamicHandlerCache.set(path, mod.default)
      return mod.default
    }
  } catch {
    /* 无对应 api 文件 */
  }
  return null
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

type VercelLikeBody = string | Buffer | Uint8Array

function adaptVercelResponse(res: ServerResponse): ServerResponse & {
  status: (code: number) => { send: (body?: VercelLikeBody) => void; end: () => void }
  send: (body?: VercelLikeBody) => void
} {
  const sendBody = (body?: VercelLikeBody) => {
    if (res.writableEnded) return
    if (body === undefined || body === null) {
      res.end()
      return
    }
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
      if (!res.getHeader('Content-Length')) {
        res.setHeader('Content-Length', String(buf.length))
      }
      res.end(buf)
      return
    }
    const text = typeof body === 'string' ? body : String(body)
    if (!res.getHeader('Content-Length')) {
      res.setHeader('Content-Length', String(Buffer.byteLength(text, 'utf8')))
    }
    res.end(text)
  }

  const r = res as ServerResponse & {
    status: (code: number) => { send: (body?: VercelLikeBody) => void; end: () => void }
    send: (body?: VercelLikeBody) => void
  }
  r.send = sendBody
  r.status = (code: number) => {
    r.statusCode = code
    return {
      send: sendBody,
      end: () => {
        if (!r.writableEnded) r.end()
      },
    }
  }
  return r
}

function parseRequestUrl(req: IncomingMessage): { path: string; query: Record<string, string> } {
  const raw = req.url ?? '/'
  const u = new URL(raw.includes('://') ? raw : `http://127.0.0.1${raw.startsWith('/') ? raw : `/${raw}`}`)
  const query: Record<string, string> = {}
  u.searchParams.forEach((v, k) => {
    query[k] = v
  })
  let path = u.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '')
  return { path, query }
}

function applyErpApiCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
}

http
  .createServer(async (req, res) => {
    const vercelRes = adaptVercelResponse(res)
    applyErpApiCors(res)
    const { path, query } = parseRequestUrl(req)
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    const handler = await resolveHandler(path)
    if (!handler) {
      res.statusCode = 404
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'not_found',
          path,
          revision: ECS_AUTH_API_ROUTE_REVISION,
          hint: '请在轻量执行: cd ~/app && git pull && bash scripts/ecs-deploy-auth-api.sh',
        }),
      )
      return
    }
    try {
      const bodyBuf = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? await readBody(req) : Buffer.alloc(0)
      let body: unknown = undefined
      if (bodyBuf.length) {
        const text = bodyBuf.toString('utf8')
        try {
          body = JSON.parse(text) as unknown
        } catch {
          body = text
        }
      }
      const slugParts =
        path.startsWith('/api/merchant/') ? path.slice('/api/merchant/'.length).split('/').filter(Boolean) : []
      const vercelReq = Object.assign(req, {
        body,
        query: slugParts.length ? { ...query, slug: slugParts } : query,
        headers: req.headers,
        url: req.url,
      })
      await handler(vercelReq, vercelRes)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'ecs_internal_api_error',
          detail: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    const n = Object.keys(routes).length
    console.log(
      `[ecs-internal-api] http://127.0.0.1:${PORT} revision=${ECS_AUTH_API_ROUTE_REVISION} routes=${n} (含 meoo-ops-sync-registry)`,
    )
  })
