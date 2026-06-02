/**
 * ECS 本机 API（Auth + 运营客服轮询），供 Nginx 反代 /erp-api/
 */
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
import paymentOrdersListHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-list.ts'
import paymentOrdersVerifyHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-verify.ts'
import paymentOrdersConfirmHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-confirm.ts'
import opsSyncRegistryGetHandler from '../api/meoo-ops-registry-ops-get.ts'
import opsSyncVendorKeysHandler from '../api/meoo-ops-sync-vendor-keys.ts'
import opsSyncAiHandler from '../api/meoo-ops-sync-ai.ts'
import opsSyncVideoAiHandler from '../api/meoo-ops-sync-video-ai.ts'
import meooAiChatHandler from '../api/meoo-ai-chat.ts'
import meooAiVendorKeysDiagHandler from '../api/meoo-ai-vendor-keys-diag.ts'
import meooAiVendorKeysProbeHandler from '../api/meoo-ai-vendor-keys-probe.ts'
import meooAiAgentImageHandler from '../api/meoo-ai-agent-image.ts'
import agentDailyInfoHandler from '../api/meoo-agent-daily-info.ts'
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
import mpRecruitmentApplyHandler from '../api/meoo-ops-mp-recruitment-orders-apply.ts'
import mpRecruitmentAppendHandler from '../api/meoo-ops-mp-recruitment-orders-append.ts'
import mpRecruitmentPatchHandler from '../api/meoo-ops-mp-recruitment-orders-patch.ts'
import mpRecruitmentDeleteHandler from '../api/meoo-ops-mp-recruitment-orders-delete.ts'
import mpTalentMemberRegisterHandler from '../api/meoo-ops-mp-talent-member-register.ts'
import mpPrUserRegisterHandler from '../api/meoo-ops-mp-pr-user-register.ts'
import mpTalentChatHandler from '../api/meoo-ops-mp-talent-chat.ts'
import mpSupportRelayHandler from '../api/meoo-ops-mp-support-relay.ts'
import mpRecruitmentIceSubmitHandler from '../api/meoo-ops-mp-recruitment-ice-submit.ts'
import mpRecruitmentIceConfirmHandler from '../api/meoo-ops-mp-recruitment-ice-confirm.ts'
import mpTalentInboxAppendHandler from '../api/meoo-ops-mp-talent-inbox-append.ts'
import mpRecruitmentAiHandler from '../api/meoo-mp-recruitment-ai.ts'
import mpHallRegistryHandler from '../api/meoo-ops-mp-hall-registry.ts'

/** 404 响应中带此字段，便于确认 ECS 是否已拉取含注册表路由的版本 */
export const ECS_AUTH_API_ROUTE_REVISION = '20260603-mp-hall-direct'

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
  '/api/meoo-supabase-payment-orders-list': paymentOrdersListHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-verify': paymentOrdersVerifyHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-confirm': paymentOrdersConfirmHandler as VercelLikeHandler,
  /** 运营台注册表：Vercel 无法出站访问 ECS Supabase，由浏览器经 /erp-api 直连本机 */
  '/api/meoo-ops-sync-registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-hall-registry': mpHallRegistryHandler as VercelLikeHandler,
  '/api/ops-sync/registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/ops-sync/vendor-keys': opsSyncVendorKeysHandler as VercelLikeHandler,
  '/api/ops-sync/ai': opsSyncAiHandler as VercelLikeHandler,
  '/api/ops-sync/video-ai': opsSyncVideoAiHandler as VercelLikeHandler,
  '/api/meoo-ai-chat': meooAiChatHandler as VercelLikeHandler,
  '/api/meoo-ai-vendor-keys-diag': meooAiVendorKeysDiagHandler as VercelLikeHandler,
  '/api/meoo-ai-vendor-keys-probe': meooAiVendorKeysProbeHandler as VercelLikeHandler,
  '/api/meoo-ai-agent-image': meooAiAgentImageHandler as VercelLikeHandler,
  '/api/meoo-agent-daily-info': agentDailyInfoHandler as VercelLikeHandler,
  /** 数字人口播：MiniMax 神经 TTS 试听、抖音链接文案（须合并运营台 vendorKeys） */
  '/api/meoo-digital-human-tts': digitalHumanTtsHandler as VercelLikeHandler,
  '/api/meoo-digital-human-douyin-link': digitalHumanDouyinLinkHandler as VercelLikeHandler,
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
  '/api/meoo-ops-mp-recruitment-orders-apply': mpRecruitmentApplyHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-append': mpRecruitmentAppendHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-patch': mpRecruitmentPatchHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-orders-delete': mpRecruitmentDeleteHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-member-register': mpTalentMemberRegisterHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-pr-user-register': mpPrUserRegisterHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-chat': mpTalentChatHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-support-relay': mpSupportRelayHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-ice-submit': mpRecruitmentIceSubmitHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-recruitment-ice-confirm': mpRecruitmentIceConfirmHandler as VercelLikeHandler,
  '/api/meoo-ops-mp-talent-inbox-append': mpTalentInboxAppendHandler as VercelLikeHandler,
  '/api/meoo-mp-recruitment-ai': mpRecruitmentAiHandler as VercelLikeHandler,
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
  // tokenmix 依赖 @supabase/supabase-js（须在 商家管理后台/node_modules）；ECS 仅走 Vercel /api/meoo-supabase-tenants-tokenmix
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function adaptVercelResponse(res: ServerResponse): ServerResponse & {
  status: (code: number) => { send: (body: string) => void; end: () => void }
} {
  const r = res as ServerResponse & {
    status: (code: number) => { send: (body: string) => void; end: () => void }
  }
  r.status = (code: number) => {
    r.statusCode = code
    return {
      send: (body: string) => {
        r.end(body)
      },
      end: () => {
        r.end()
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
    const handler = routes[path]
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
          hint: '请在 ECS 执行: cd ~/app && git pull && bash scripts/ecs-run-auth-api.sh（或 systemctl restart meoo-auth-api）',
        }),
      )
      return
    }
    try {
      const bodyBuf = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0)
      let body: unknown = undefined
      if (bodyBuf.length) {
        const text = bodyBuf.toString('utf8')
        try {
          body = JSON.parse(text) as unknown
        } catch {
          body = text
        }
      }
      const vercelReq = Object.assign(req, { body, query, headers: req.headers })
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
