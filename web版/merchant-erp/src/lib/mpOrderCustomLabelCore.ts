import {
  createMpOrderCustomLabelAdmin,
  deleteOrderCustomLabel,
  listOrderCustomLabelsByOwner,
  type MpOrderCustomLabelRow,
  upsertOrderCustomLabel,
} from './mpOrderCustomLabelSupabase.js'
import { ownerFromMpAccount, type MpCalendarReminderAuth } from './mpCalendarReminderCore.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'

export { ownerFromMpAccount }
export type MpOrderCustomLabelAuth = MpCalendarReminderAuth

export type MpOrderCustomLabelBody = {
  action?: string
  mpOrderId?: string
  labelText?: string
  color?: string
}

export const ORDER_LABEL_COLORS = ['violet', 'emerald', 'orange', 'red', 'blue', 'pink', 'slate'] as const
export type OrderLabelColor = (typeof ORDER_LABEL_COLORS)[number]

export const ORDER_LABEL_PRESETS = [
  { text: '重点', color: 'red' as OrderLabelColor },
  { text: '加急', color: 'orange' as OrderLabelColor },
  { text: '待沟通', color: 'violet' as OrderLabelColor },
  { text: '需改期', color: 'pink' as OrderLabelColor },
  { text: '高佣金', color: 'emerald' as OrderLabelColor },
  { text: '同城', color: 'blue' as OrderLabelColor },
  { text: '远程', color: 'slate' as OrderLabelColor },
  { text: '已完成', color: 'slate' as OrderLabelColor },
] as const

const COLOR_SET = new Set<string>(ORDER_LABEL_COLORS)
const MAX_LABEL_LEN = 16

function labelErrorResponse(e: unknown): { status: number; data: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e)
  const hint = /Could not find|PGRST205|schema cache|does not exist|42P01/i.test(msg)
    ? '轻量执行迁移 20260714100000_mp_order_custom_labels.sql'
    : /fetch failed|ECONNREFUSED|8888/i.test(msg)
      ? 'ECS PostgREST 未响应：sudo systemctl restart meoo-postgrest'
      : undefined
  return {
    status: 500,
    data: {
      ok: false,
      error: 'order_label_db_error',
      detail: msg.slice(0, 800),
      ...(hint ? { hint } : {}),
    },
  }
}

function normalizeColor(raw: unknown): OrderLabelColor {
  const c = String(raw || 'violet').trim()
  return COLOR_SET.has(c) ? (c as OrderLabelColor) : 'violet'
}

function normalizeLabelText(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LABEL_LEN)
}

function rowToClient(row: MpOrderCustomLabelRow): Record<string, unknown> {
  return {
    id: row.id,
    ownerKey: row.owner_key,
    ownerRole: row.owner_role,
    mpOrderId: row.mp_order_id,
    labelText: row.label_text,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function handleMpOrderCustomLabelBody(
  body: MpOrderCustomLabelBody,
  auth: MpOrderCustomLabelAuth,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      },
    }
  }

  const action = String(body.action || 'list').trim()
  const sb = createMpOrderCustomLabelAdmin(supabaseUrl, serviceRole)

  try {
    if (action === 'list') {
      const rows = await listOrderCustomLabelsByOwner(sb, auth.ownerKey)
      return { status: 200, data: { ok: true, labels: rows.map(rowToClient) } }
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) {
      return { status: 400, data: { ok: false, error: 'missing_mp_order_id' } }
    }

    if (action === 'delete') {
      const deleted = await deleteOrderCustomLabel(sb, auth.ownerKey, mpOrderId)
      return { status: 200, data: { ok: true, deleted } }
    }

    if (action === 'upsert') {
      const labelText = normalizeLabelText(body.labelText)
      if (!labelText) {
        return { status: 400, data: { ok: false, error: 'missing_label_text' } }
      }
      const row = await upsertOrderCustomLabel(sb, {
        ownerKey: auth.ownerKey,
        ownerRole: auth.ownerRole,
        mpOrderId,
        labelText,
        color: normalizeColor(body.color),
      })
      return { status: 200, data: { ok: true, label: rowToClient(row) } }
    }

    return { status: 400, data: { ok: false, error: 'invalid_action' } }
  } catch (e) {
    return labelErrorResponse(e)
  }
}
