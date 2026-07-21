import { randomBytes } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { erpAwareFetch } from './erpAwareHttpsFetch.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import {
  isApplicantIcePublishLink,
  toPlayableRecruitmentVideoUrl,
} from './mpRecruitmentVideoCore.js'

export type VideoReviewShareDb = PostgrestClient

/** ECS PostgREST 直连，不初始化 Realtime，避免 Node 20 WebSocket 报错 */
export function createVideoReviewShareAdmin(url: string, serviceRole: string): VideoReviewShareDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

export type VideoReviewShareAnnotation = {
  id: string
  applicantId: string
  visitorName: string
  frameTimeSec: number | null
  rectX: number
  rectY: number
  rectW: number
  rectH: number
  commentText: string
  createdAt: string
}

export type VideoReviewShareVideo = {
  applicantId: string
  displayName: string
  videoUrl: string
  videoStatus: string
  videoSubmittedAt: string
}

const SHARE_TOKEN_PREFIX = 'vr_'
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function pgErrorMessage(error: unknown): string {
  if (!error) return 'db_error'
  if (typeof error === 'string') return error
  const e = error as Record<string, unknown>
  const msg = String(e.message || e.details || e.hint || e.code || '').trim()
  if (msg) return msg
  try {
    return JSON.stringify(error).slice(0, 400)
  } catch {
    return 'db_error'
  }
}

function srHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function parseRestErrorText(text: string, status?: number): string {
  const raw = String(text || '').trim()
  if (!raw) return status === 404 ? 'table_not_in_postgrest_schema' : 'empty_db_response'
  try {
    const j = JSON.parse(raw) as { message?: string; code?: string; details?: string; hint?: string }
    const msg = String(j.message || j.details || j.hint || j.code || '').trim()
    if (msg && msg !== '()') return msg.slice(0, 400)
    return raw.slice(0, 400) || 'empty_db_response'
  } catch {
    return raw.slice(0, 400) || 'empty_db_response'
  }
}

function isTableMissingError(msg: string): boolean {
  return /Could not find the table|PGRST205|schema cache|table_not_in_postgrest|does not exist|42P01/i.test(msg)
}

function isRlsDbError(msg: string): boolean {
  return /permission denied|42501|row-level security|RLS|violates row-level/i.test(msg)
}

function dbWriteFailure(message: string): { status: number; data: Record<string, unknown> } {
  const msg = String(message || '').trim()
  if (isTableMissingError(msg)) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'video_review_share_table_missing',
        detail: msg.slice(0, 400),
        hint: '轻量执行: cd ~/app && bash scripts/ecs-fix-mp-video-review-share.sh',
      },
    }
  }
  const rls = isRlsDbError(msg)
  const safeMsg = msg && msg !== '()' ? msg : 'share_db_write_failed'
  return {
    status: 500,
    data: {
      ok: false,
      error: rls ? 'video_review_share_db_permission' : safeMsg.slice(0, 200),
      detail: msg.slice(0, 400) || safeMsg,
      hint: rls || isTableMissingError(msg)
        ? '轻量执行: cd ~/app && bash scripts/ecs-fix-mp-video-review-share.sh'
        : undefined,
    },
  }
}

async function restInsertRow(
  supabaseUrl: string,
  serviceRole: string,
  table: string,
  row: Record<string, unknown>,
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; message: string }> {
  const base = supabaseUrl.replace(/\/$/, '')
  const r = await erpAwareFetch(`${base}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...srHeaders(serviceRole), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  const t = await r.text()
  if (!r.ok) return { ok: false, message: parseRestErrorText(t, r.status) }
  try {
    const rows = JSON.parse(t || '[]') as Record<string, unknown>[]
    const first = Array.isArray(rows) ? rows[0] : rows
    return { ok: true, row: (first ?? row) as Record<string, unknown> }
  } catch {
    return { ok: true, row }
  }
}

async function restPatchRows(
  supabaseUrl: string,
  serviceRole: string,
  table: string,
  query: string,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = supabaseUrl.replace(/\/$/, '')
  const r = await erpAwareFetch(`${base}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...srHeaders(serviceRole), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  const t = await r.text()
  if (!r.ok) return { ok: false, message: parseRestErrorText(t, r.status) }
  return { ok: true }
}

function shareSiteOrigin(): string {
  const raw = (process.env.MEOO_VIDEO_REVIEW_SHARE_BASE ?? '').trim()
  if (raw) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
      return u.origin
    } catch {
      return raw.replace(/\/$/, '').replace(/\/video-review-share.*$/i, '')
    }
  }
  return 'https://dr.mofangdianai.com'
}

/** 履约 dr Web 公开分享页（免登录） */
function buildDrSharePageUrl(mpOrderId: string, token: string): string {
  const origin = shareSiteOrigin()
  const id = encodeURIComponent(String(mpOrderId || '').trim())
  const t = encodeURIComponent(String(token || '').trim())
  return `${origin}/orders/${id}/video-review/share/${t}`
}

/** 小程序 #小程序:// 短链，与 dr 共用同一 token */
function buildMpSharePageUrl(token: string): string {
  const appName = String(process.env.MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'
  const t = encodeURIComponent(String(token || '').trim())
  return `#小程序://${appName}/pages/video-review-share/video-review-share?token=${t}`
}

function shareLinkPayload(mpOrderId: string, token: string, expiresAt: string) {
  return {
    ok: true as const,
    token,
    /** dr 履约 Web 分享链接 */
    shareUrl: buildDrSharePageUrl(mpOrderId, token),
    /** 小程序分享链接（同一 token，备注数据互通） */
    mpShareUrl: buildMpSharePageUrl(token),
    expiresAt,
  }
}

function genToken(): string {
  return SHARE_TOKEN_PREFIX + randomBytes(12).toString('base64url')
}

function isIceMpOrder(mp: Record<string, unknown>): boolean {
  const kind = String(mp.orderKind || mp.kind || '').trim().toLowerCase()
  if (kind === 'ice' || kind === 'cloud_edit') return true
  const meta = mp.mpPublishMeta as Record<string, unknown> | undefined
  return String(meta?.orderKind || '').trim().toLowerCase() === 'ice'
}

function isApplicantVisible(a: Record<string, unknown>, isIce: boolean): boolean {
  const status = String(a.videoStatus || '').trim()
  if (status === 'draft') return false
  if (status === 'rejected') return true
  const url = isIce
    ? String(a.videoUrl || a.douyinPublishUrl || '').trim()
    : String(a.videoUrl || '').trim()
  return !!url
}

function displayNameForApplicant(a: Record<string, unknown>, i: number): string {
  const nick = String(a.nickName || a.nickname || a.talentNickName || '').trim()
  if (nick) return nick
  const name = String(a.name || a.talentName || '').trim()
  if (name) return name
  return `达人${i + 1}`
}

function mapAnnotationRow(row: Record<string, unknown>): VideoReviewShareAnnotation {
  return {
    id: String(row.id),
    applicantId: String(row.applicant_id),
    visitorName: String(row.visitor_name || '访客'),
    frameTimeSec: row.frame_time_sec != null ? Number(row.frame_time_sec) : null,
    rectX: Number(row.rect_x ?? 0),
    rectY: Number(row.rect_y ?? 0),
    rectW: Number(row.rect_w ?? 0.2),
    rectH: Number(row.rect_h ?? 0.2),
    commentText: String(row.comment_text || ''),
    createdAt: String(row.created_at || ''),
  }
}

async function loadShareLinkByToken(admin: VideoReviewShareDb, token: string) {
  const { data, error } = await admin
    .from('mp_video_review_share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(pgErrorMessage(error))
  return data as Record<string, unknown> | null
}

async function loadActiveShareLinkByOrder(admin: VideoReviewShareDb, mpOrderId: string) {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('mp_video_review_share_links')
    .select('*')
    .eq('mp_order_id', mpOrderId)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(pgErrorMessage(error))
  return data as Record<string, unknown> | null
}

function linkValid(link: Record<string, unknown> | null): link is Record<string, unknown> {
  if (!link) return false
  if (link.revoked_at) return false
  const exp = String(link.expires_at || '')
  if (exp && new Date(exp).getTime() <= Date.now()) return false
  return true
}

export async function handleVideoReviewShareBody(
  admin: VideoReviewShareDb,
  supabaseUrl: string,
  serviceRole: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const action = String(body.action || '').trim().toLowerCase()

  if (action === 'create') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) return { status: 400, data: { ok: false, error: 'mp_order_id_required' } }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const reg = await io.load()
    const mp = (reg.mpRecruitmentOrders ?? []).find((o) => String(o.id) === mpOrderId)
    if (!mp) return { status: 404, data: { ok: false, error: 'order_not_found' } }

    const existing = await loadActiveShareLinkByOrder(admin, mpOrderId)
    if (existing && linkValid(existing)) {
      const token = String(existing.token)
      return {
        status: 200,
        data: shareLinkPayload(mpOrderId, token, String(existing.expires_at)),
      }
    }

    const token = genToken()
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString()
    const inserted = await restInsertRow(supabaseUrl, serviceRole, 'mp_video_review_share_links', {
      mp_order_id: mpOrderId,
      token,
      expires_at: expiresAt,
    })
    if (!inserted.ok) return dbWriteFailure(inserted.message)
    return {
      status: 200,
      data: shareLinkPayload(mpOrderId, token, expiresAt),
    }
  }

  if (action === 'revoke') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    const token = String(body.token || '').trim()
    if (!mpOrderId && !token) return { status: 400, data: { ok: false, error: 'token_or_order_required' } }
    const revokedAt = new Date().toISOString()
    const query = token
      ? `token=eq.${encodeURIComponent(token)}`
      : `mp_order_id=eq.${encodeURIComponent(mpOrderId)}&revoked_at=is.null`
    const patched = await restPatchRows(supabaseUrl, serviceRole, 'mp_video_review_share_links', query, {
      revoked_at: revokedAt,
    })
    if (!patched.ok) return dbWriteFailure(patched.message)
    return { status: 200, data: { ok: true } }
  }

  if (action === 'public_get') {
    const token = String(body.token || '').trim()
    if (!token) return { status: 400, data: { ok: false, error: 'token_required' } }
    const link = await loadShareLinkByToken(admin, token)
    if (!linkValid(link)) return { status: 404, data: { ok: false, error: 'share_link_invalid' } }

    const mpOrderId = String(link.mp_order_id)
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const reg = await io.load()
    const mp = (reg.mpRecruitmentOrders ?? []).find((o) => String(o.id) === mpOrderId) as
      | Record<string, unknown>
      | undefined
    if (!mp) return { status: 404, data: { ok: false, error: 'order_not_found' } }

    const isIce = isIceMpOrder(mp)
    const applicants = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
    const videos: VideoReviewShareVideo[] = applicants
      .filter((a) => isApplicantVisible(a, isIce) && !isApplicantIcePublishLink(isIce, a))
      .map((a, i) => ({
        applicantId: String(a.id || ''),
        displayName: displayNameForApplicant(a, i),
        videoUrl: toPlayableRecruitmentVideoUrl(String(a.videoUrl || '').trim()),
        videoStatus: String(a.videoStatus || 'pending'),
        videoSubmittedAt: String(a.videoSubmittedAt || ''),
      }))
      .filter((v) => v.applicantId && v.videoUrl)

    const { data: annoRows, error: annoErr } = await admin
      .from('mp_video_review_share_annotations')
      .select('*')
      .eq('share_link_id', String(link.id))
      .order('created_at', { ascending: true })
    if (annoErr) return { status: 500, data: { ok: false, error: pgErrorMessage(annoErr) } }

    return {
      status: 200,
      data: {
        ok: true,
        mpOrderId,
        title: String(mp.title || mpOrderId),
        expiresAt: String(link.expires_at),
        videos,
        annotations: (annoRows ?? []).map((r) => mapAnnotationRow(r as Record<string, unknown>)),
      },
    }
  }

  if (action === 'add_annotation') {
    const token = String(body.token || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const visitorName = String(body.visitorName || '访客').trim().slice(0, 40) || '访客'
    const commentText = String(body.commentText || '').trim().slice(0, 500)
    if (!token || !applicantId) return { status: 400, data: { ok: false, error: 'invalid_annotation' } }
    if (!commentText) return { status: 400, data: { ok: false, error: 'comment_required' } }

    const link = await loadShareLinkByToken(admin, token)
    if (!linkValid(link)) return { status: 404, data: { ok: false, error: 'share_link_invalid' } }

    const frameRaw = body.frameTimeSec
    const frameTimeSec =
      frameRaw != null && frameRaw !== '' && !Number.isNaN(Number(frameRaw)) ? Number(frameRaw) : null
    const rectX = Math.min(1, Math.max(0, Number(body.rectX ?? 0.1)))
    const rectY = Math.min(1, Math.max(0, Number(body.rectY ?? 0.1)))
    const rectW = Math.min(1, Math.max(0.05, Number(body.rectW ?? 0.2)))
    const rectH = Math.min(1, Math.max(0.05, Number(body.rectH ?? 0.2)))

    const inserted = await restInsertRow(supabaseUrl, serviceRole, 'mp_video_review_share_annotations', {
      share_link_id: String(link.id),
      applicant_id: applicantId,
      visitor_name: visitorName,
      frame_time_sec: frameTimeSec,
      rect_x: rectX,
      rect_y: rectY,
      rect_w: rectW,
      rect_h: rectH,
      comment_text: commentText,
    })
    if (!inserted.ok) return dbWriteFailure(inserted.message)
    return {
      status: 200,
      data: { ok: true, annotation: mapAnnotationRow(inserted.row) },
    }
  }

  if (action === 'list_feedback') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) return { status: 400, data: { ok: false, error: 'mp_order_id_required' } }

    const { data: links, error: linkErr } = await admin
      .from('mp_video_review_share_links')
      .select('id')
      .eq('mp_order_id', mpOrderId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (linkErr) return { status: 500, data: { ok: false, error: pgErrorMessage(linkErr) } }
    const linkIds = (links ?? []).map((l) => String((l as Record<string, unknown>).id))
    if (!linkIds.length) return { status: 200, data: { ok: true, annotations: [] } }

    const { data: rows, error } = await admin
      .from('mp_video_review_share_annotations')
      .select('*')
      .in('share_link_id', linkIds)
      .order('created_at', { ascending: true })
    if (error) return { status: 500, data: { ok: false, error: pgErrorMessage(error) } }

    const active = await loadActiveShareLinkByOrder(admin, mpOrderId)
    const activeToken = active && linkValid(active) ? String(active.token) : ''
    return {
      status: 200,
      data: {
        ok: true,
        annotations: (rows ?? []).map((r) => mapAnnotationRow(r as Record<string, unknown>)),
        token: activeToken || null,
        shareUrl: activeToken ? buildDrSharePageUrl(mpOrderId, activeToken) : null,
        mpShareUrl: activeToken ? buildMpSharePageUrl(activeToken) : null,
        expiresAt: active && linkValid(active) ? String(active.expires_at) : null,
      },
    }
  }

  return { status: 400, data: { ok: false, error: 'unknown_action' } }
}
