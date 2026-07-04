import { randomBytes } from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { erpAwareFetch } from './erpAwareHttpsFetch.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'

export type ApplicantPickShareDb = PostgrestClient

export function createApplicantPickShareAdmin(url: string, serviceRole: string): ApplicantPickShareDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

export type ApplicantPickShareNote = {
  id: string
  applicantId: string
  visitorName: string
  noteText: string
  createdAt: string
  updatedAt: string
}

export type ApplicantPickShareTalent = {
  applicantId: string
  displayName: string
  platform: string
  platformAccount: string
  displayFollowers: string
  displaySalesLevel: string
  profileLink: string
  accountTags: string[]
}

const SHARE_TOKEN_PREFIX = 'ap_'
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
        error: 'applicant_pick_share_table_missing',
        message: '分享功能未就绪，请联系运营',
        detail: msg.slice(0, 400),
        hint: '轻量执行迁移 20260703120000_mp_applicant_pick_share.sql',
      },
    }
  }
  const rls = isRlsDbError(msg)
  const safeMsg = msg && msg !== '()' ? msg : 'share_db_write_failed'
  return {
    status: 500,
    data: {
      ok: false,
      error: rls ? 'applicant_pick_share_db_permission' : safeMsg.slice(0, 200),
      detail: msg.slice(0, 400) || safeMsg,
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

function buildDrSharePageUrl(mpOrderId: string, token: string): string {
  const origin = shareSiteOrigin()
  const id = encodeURIComponent(String(mpOrderId || '').trim())
  const t = encodeURIComponent(String(token || '').trim())
  return `${origin}/orders/${id}/applicants/share/${t}`
}

function buildMpSharePageUrl(token: string): string {
  const appName = String(process.env.MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'
  const t = encodeURIComponent(String(token || '').trim())
  return `#小程序://${appName}/pages/subpack-pr/applicant-pick-share/applicant-pick-share?token=${t}`
}

function shareLinkPayload(mpOrderId: string, token: string, expiresAt: string, applicantIds: string[]) {
  return {
    ok: true as const,
    token,
    applicantIds,
    shareUrl: buildDrSharePageUrl(mpOrderId, token),
    mpShareUrl: buildMpSharePageUrl(token),
    expiresAt,
  }
}

function genToken(): string {
  return SHARE_TOKEN_PREFIX + randomBytes(12).toString('base64url')
}

function normalizeApplicantIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
}

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function displayNameForApplicant(a: Record<string, unknown>, i: number): string {
  const nick = String(a.platformNickname || a.nickName || a.nickname || '').trim()
  if (nick) return nick
  const name = String(a.name || a.talentName || '').trim()
  if (name) return name
  return `达人${i + 1}`
}

function formatFollowers(n: unknown): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n ?? '').trim() || '—'
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return String(num)
}

function mapTalentRow(
  a: Record<string, unknown>,
  i: number,
  mp: Record<string, unknown>,
): ApplicantPickShareTalent {
  const tags = Array.isArray(a.accountTags)
    ? (a.accountTags as unknown[]).map((t) => String(t || '').trim()).filter(Boolean)
    : []
  const displaySalesLevel = String(a.douyinSalesLevel || a.talentGrade || '—')
  return {
    applicantId: String(a.id || ''),
    displayName: displayNameForApplicant(a, i),
    platform: String(a.platform || '抖音'),
    platformAccount: String(a.platformAccount || ''),
    displayFollowers: formatFollowers(a.followers),
    displaySalesLevel,
    profileLink: String(a.profileLink || '').trim(),
    accountTags: tags,
  }
}

function mapNoteRow(row: Record<string, unknown>): ApplicantPickShareNote {
  return {
    id: String(row.id),
    applicantId: String(row.applicant_id),
    visitorName: String(row.visitor_name || '商家'),
    noteText: String(row.note_text || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || row.created_at || ''),
  }
}

function parseApplicantIdsFromLink(link: Record<string, unknown>): string[] {
  const raw = link.applicant_ids
  if (Array.isArray(raw)) return normalizeApplicantIds(raw)
  if (typeof raw === 'string') {
    try {
      return normalizeApplicantIds(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return []
}

async function loadShareLinkByToken(admin: ApplicantPickShareDb, token: string) {
  const { data, error } = await admin
    .from('mp_applicant_pick_share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw new Error(pgErrorMessage(error))
  return data as Record<string, unknown> | null
}

async function loadActiveShareLinkByOrder(admin: ApplicantPickShareDb, mpOrderId: string) {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('mp_applicant_pick_share_links')
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

function buildTalentsForIds(mp: Record<string, unknown>, applicantIds: string[]): ApplicantPickShareTalent[] {
  const applicants = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
  const idSet = new Set(applicantIds)
  return applicants
    .filter((a) => idSet.has(String(a.id || '')))
    .map((a, i) => mapTalentRow(a, i, mp))
    .filter((t) => t.applicantId)
}

export async function handleApplicantPickShareBody(
  admin: ApplicantPickShareDb,
  supabaseUrl: string,
  serviceRole: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const action = String(body.action || '').trim().toLowerCase()

  if (action === 'create') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    const applicantIds = normalizeApplicantIds(body.applicantIds)
    if (!mpOrderId) return { status: 400, data: { ok: false, error: 'mp_order_id_required' } }
    if (!applicantIds.length) return { status: 400, data: { ok: false, error: 'applicant_ids_required' } }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const reg = await io.load()
    const mp = (reg.mpRecruitmentOrders ?? []).find((o) => String(o.id) === mpOrderId) as
      | Record<string, unknown>
      | undefined
    if (!mp) return { status: 404, data: { ok: false, error: 'order_not_found' } }

    const existing = await loadActiveShareLinkByOrder(admin, mpOrderId)
    if (existing && linkValid(existing)) {
      const prevIds = parseApplicantIdsFromLink(existing)
      const token = String(existing.token)
      const expiresAt = String(existing.expires_at)
      if (idsEqual(prevIds, applicantIds)) {
        return { status: 200, data: shareLinkPayload(mpOrderId, token, expiresAt, applicantIds) }
      }
      const patched = await restPatchRows(
        supabaseUrl,
        serviceRole,
        'mp_applicant_pick_share_links',
        `id=eq.${encodeURIComponent(String(existing.id))}`,
        { applicant_ids: applicantIds },
      )
      if (!patched.ok) return dbWriteFailure(patched.message)
      return { status: 200, data: shareLinkPayload(mpOrderId, token, expiresAt, applicantIds) }
    }

    const token = genToken()
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString()
    const inserted = await restInsertRow(supabaseUrl, serviceRole, 'mp_applicant_pick_share_links', {
      mp_order_id: mpOrderId,
      token,
      applicant_ids: applicantIds,
      expires_at: expiresAt,
    })
    if (!inserted.ok) return dbWriteFailure(inserted.message)
    return { status: 200, data: shareLinkPayload(mpOrderId, token, expiresAt, applicantIds) }
  }

  if (action === 'revoke') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    const token = String(body.token || '').trim()
    if (!mpOrderId && !token) return { status: 400, data: { ok: false, error: 'token_or_order_required' } }
    const revokedAt = new Date().toISOString()
    const query = token
      ? `token=eq.${encodeURIComponent(token)}`
      : `mp_order_id=eq.${encodeURIComponent(mpOrderId)}&revoked_at=is.null`
    const patched = await restPatchRows(supabaseUrl, serviceRole, 'mp_applicant_pick_share_links', query, {
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
    const applicantIds = parseApplicantIdsFromLink(link)
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const reg = await io.load()
    const mp = (reg.mpRecruitmentOrders ?? []).find((o) => String(o.id) === mpOrderId) as
      | Record<string, unknown>
      | undefined
    if (!mp) return { status: 404, data: { ok: false, error: 'order_not_found' } }

    const talents = buildTalentsForIds(mp, applicantIds)

    const { data: noteRows, error: noteErr } = await admin
      .from('mp_applicant_pick_share_notes')
      .select('*')
      .eq('share_link_id', String(link.id))
      .order('updated_at', { ascending: true })
    if (noteErr) return { status: 500, data: { ok: false, error: pgErrorMessage(noteErr) } }

    return {
      status: 200,
      data: {
        ok: true,
        mpOrderId,
        title: String(mp.title || mpOrderId),
        expiresAt: String(link.expires_at),
        applicantIds,
        talents,
        notes: (noteRows ?? []).map((r) => mapNoteRow(r as Record<string, unknown>)),
      },
    }
  }

  if (action === 'upsert_note') {
    const token = String(body.token || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const visitorName = String(body.visitorName || '商家').trim().slice(0, 40) || '商家'
    const noteText = String(body.noteText || '').trim().slice(0, 500)
    if (!token || !applicantId) return { status: 400, data: { ok: false, error: 'invalid_note' } }
    if (!noteText) return { status: 400, data: { ok: false, error: 'note_required' } }

    const link = await loadShareLinkByToken(admin, token)
    if (!linkValid(link)) return { status: 404, data: { ok: false, error: 'share_link_invalid' } }

    const allowedIds = parseApplicantIdsFromLink(link)
    if (!allowedIds.includes(applicantId)) {
      return { status: 403, data: { ok: false, error: 'applicant_not_in_share' } }
    }

    const shareLinkId = String(link.id)
    const now = new Date().toISOString()
    const { data: existing, error: findErr } = await admin
      .from('mp_applicant_pick_share_notes')
      .select('*')
      .eq('share_link_id', shareLinkId)
      .eq('applicant_id', applicantId)
      .maybeSingle()
    if (findErr) return { status: 500, data: { ok: false, error: pgErrorMessage(findErr) } }

    if (existing) {
      const patched = await restPatchRows(
        supabaseUrl,
        serviceRole,
        'mp_applicant_pick_share_notes',
        `id=eq.${encodeURIComponent(String((existing as Record<string, unknown>).id))}`,
        { visitor_name: visitorName, note_text: noteText, updated_at: now },
      )
      if (!patched.ok) return dbWriteFailure(patched.message)
      return {
        status: 200,
        data: {
          ok: true,
          note: mapNoteRow({
            ...(existing as Record<string, unknown>),
            visitor_name: visitorName,
            note_text: noteText,
            updated_at: now,
          }),
        },
      }
    }

    const inserted = await restInsertRow(supabaseUrl, serviceRole, 'mp_applicant_pick_share_notes', {
      share_link_id: shareLinkId,
      applicant_id: applicantId,
      visitor_name: visitorName,
      note_text: noteText,
      updated_at: now,
    })
    if (!inserted.ok) return dbWriteFailure(inserted.message)
    return { status: 200, data: { ok: true, note: mapNoteRow(inserted.row) } }
  }

  if (action === 'list_feedback') {
    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) return { status: 400, data: { ok: false, error: 'mp_order_id_required' } }

    const { data: links, error: linkErr } = await admin
      .from('mp_applicant_pick_share_links')
      .select('id, token, expires_at, revoked_at, applicant_ids, created_at')
      .eq('mp_order_id', mpOrderId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (linkErr) return { status: 500, data: { ok: false, error: pgErrorMessage(linkErr) } }
    const linkIds = (links ?? []).map((l) => String((l as Record<string, unknown>).id))
    if (!linkIds.length) {
      return { status: 200, data: { ok: true, notes: [], byApplicant: {} } }
    }

    const { data: rows, error } = await admin
      .from('mp_applicant_pick_share_notes')
      .select('*')
      .in('share_link_id', linkIds)
      .order('updated_at', { ascending: true })
    if (error) return { status: 500, data: { ok: false, error: pgErrorMessage(error) } }

    const notes = (rows ?? []).map((r) => mapNoteRow(r as Record<string, unknown>))
    const byApplicant: Record<string, ApplicantPickShareNote> = {}
    for (const n of notes) {
      byApplicant[n.applicantId] = n
    }

    const active = await loadActiveShareLinkByOrder(admin, mpOrderId)
    const activeToken = active && linkValid(active) ? String(active.token) : ''
    const activeIds = active && linkValid(active) ? parseApplicantIdsFromLink(active) : []
    return {
      status: 200,
      data: {
        ok: true,
        notes,
        byApplicant,
        token: activeToken || null,
        applicantIds: activeIds,
        shareUrl: activeToken ? buildDrSharePageUrl(mpOrderId, activeToken) : null,
        mpShareUrl: activeToken ? buildMpSharePageUrl(activeToken) : null,
        expiresAt: active && linkValid(active) ? String(active.expires_at) : null,
      },
    }
  }

  return { status: 400, data: { ok: false, error: 'unknown_action' } }
}
