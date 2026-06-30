import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { OPS_MASTER_PHONE, readOpsSession } from './opsStaffAuth'
import { deleteRegistryTenant } from './opsRegistryApi'

export type DeleteOpsCustomerInput = {
  id: string
  loginName?: string
  merchantName?: string
  ownerPhone?: string
  isSupabase: boolean
  masterPassword?: string
  deleteSmsCode: string
}

export type DeleteOpsCustomerResult = {
  ok: boolean
  message?: string
  error?: string
  detail?: string
}

function parseJsonBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function deleteOpsCustomer(input: DeleteOpsCustomerInput): Promise<DeleteOpsCustomerResult> {
  const session = readOpsSession()
  const masterPhone = session?.phone.replace(/\D/g, '').slice(0, 11) ?? OPS_MASTER_PHONE
  if (masterPhone !== OPS_MASTER_PHONE) {
    return { ok: false, error: 'forbidden', message: '仅超级管理员可删除客户' }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.sessionToken) {
    headers.Authorization = `Bearer ${session.sessionToken}`
  }

  const payload: Record<string, unknown> = {
    id: input.id,
    ownerPhone: input.ownerPhone ?? undefined,
    masterPhone: OPS_MASTER_PHONE,
    deleteSmsCode: input.deleteSmsCode,
  }
  if (!session?.sessionToken && input.masterPassword) {
    payload.masterPassword = input.masterPassword
  }

  if (input.isSupabase) {
    const res = await fetchOpsErpApi('/api/meoo-supabase-tenants-delete', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const raw = await res.text()
    const j = parseJsonBody(raw) as {
      ok?: boolean
      error?: string
      message?: string
      detail?: string
    }
    if (!res.ok || !j.ok) {
      return {
        ok: false,
        error: j.error ?? `http_${res.status}`,
        message: j.message ?? '云端租户删除失败',
        detail: typeof j.detail === 'string' ? j.detail : raw.trim().slice(0, 400) || undefined,
      }
    }
  }

  const reg = await deleteRegistryTenant({
    id: input.id,
    merchantName: input.merchantName,
    loginName: input.loginName,
    deleteSmsCode: input.deleteSmsCode,
  })
  if (!reg.ok) {
    return {
      ok: false,
      error: reg.error ?? 'registry_delete_failed',
      message: input.isSupabase
        ? '云端已删除，但注册表清理失败，请手动检查'
        : '注册表删除失败',
      detail: reg.detail,
    }
  }

  return {
    ok: true,
    message: input.isSupabase
      ? '客户、关联数据及商家版注册手机号已从数据库清除'
      : '客户已从注册表清除',
  }
}
