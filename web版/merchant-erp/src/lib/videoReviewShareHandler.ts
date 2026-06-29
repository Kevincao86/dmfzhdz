import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'

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

function shareBaseUrl(): string {
  const raw = (process.env.MEOO_VIDEO_REVIEW_SHARE_BASE ?? '').trim()
  if (raw) return raw.replace(/\/$/, '')
  return 'https://dr.mofangdianai.com/video-review-share'
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

async function loadShareLinkByToken(admin: SupabaseClient, token: string) {
  const { data, error } = await admin
    .from('mp_video_review_share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

async function loadActiveShareLinkByOrder(admin: SupabaseClient, mpOrderId: string) {
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
  if (error) throw new Error(error.message)
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
  admin: SupabaseClient,
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
        data: {
          ok: true,
          token,
          shareUrl: `${shareBaseUrl()}/${token}`,
          expiresAt: String(existing.expires_at),
        },
      }
    }

    const token = genToken()
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString()
    const { error } = await admin.from('mp_video_review_share_links').insert({
      mp_order_id: mpOrderId,
      token,
      expires_at: expiresAt,
    })
    if (error) return { status: 500, data: { ok: false, error: error.message } }
    return {
      status: 200,
      data: { ok: true, token, shareUrl: `${shareBaseUrl()}/${token}`, expiresAt },
    }
  }

  if (action === 'revoke') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    const token = String(body.token || '').trim()
    if (!mpOrderId && !token) return { status: 400, data: { ok: false, error: 'token_or_order_required' } }
    let q = admin.from('mp_video_review_share_links').update({ revoked_at: new Date().toISOString() })
    if (token) q = q.eq('token', token)
    else q = q.eq('mp_order_id', mpOrderId).is('revoked_at', null)
    const { error } = await q
    if (error) return { status: 500, data: { ok: false, error: error.message } }
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
      .filter((a) => isApplicantVisible(a, isIce))
      .map((a, i) => ({
        applicantId: String(a.id || ''),
        displayName: displayNameForApplicant(a, i),
        videoUrl: isIce
          ? String(a.videoUrl || a.douyinPublishUrl || '').trim()
          : String(a.videoUrl || '').trim(),
        videoStatus: String(a.videoStatus || 'pending'),
        videoSubmittedAt: String(a.videoSubmittedAt || ''),
      }))
      .filter((v) => v.applicantId && v.videoUrl)

    const { data: annoRows, error: annoErr } = await admin
      .from('mp_video_review_share_annotations')
      .select('*')
      .eq('share_link_id', String(link.id))
      .order('created_at', { ascending: true })
    if (annoErr) return { status: 500, data: { ok: false, error: annoErr.message } }

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

    const { data, error } = await admin
      .from('mp_video_review_share_annotations')
      .insert({
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
      .select('*')
      .single()
    if (error) return { status: 500, data: { ok: false, error: error.message } }
    return {
      status: 200,
      data: { ok: true, annotation: mapAnnotationRow(data as Record<string, unknown>) },
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
    if (linkErr) return { status: 500, data: { ok: false, error: linkErr.message } }
    const linkIds = (links ?? []).map((l) => String((l as Record<string, unknown>).id))
    if (!linkIds.length) return { status: 200, data: { ok: true, annotations: [] } }

    const { data: rows, error } = await admin
      .from('mp_video_review_share_annotations')
      .select('*')
      .in('share_link_id', linkIds)
      .order('created_at', { ascending: true })
    if (error) return { status: 500, data: { ok: false, error: error.message } }

    const active = await loadActiveShareLinkByOrder(admin, mpOrderId)
    return {
      status: 200,
      data: {
        ok: true,
        annotations: (rows ?? []).map((r) => mapAnnotationRow(r as Record<string, unknown>)),
        shareUrl: active && linkValid(active)
          ? `${shareBaseUrl()}/${String(active.token)}`
          : null,
        expiresAt: active && linkValid(active) ? String(active.expires_at) : null,
      },
    }
  }

  return { status: 400, data: { ok: false, error: 'unknown_action' } }
}
