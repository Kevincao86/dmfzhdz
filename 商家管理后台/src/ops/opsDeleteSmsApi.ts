import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { readOpsSession } from './opsStaffAuth'

export async function sendOpsDeleteConfirmSms(): Promise<
  | { ok: true; message: string; phoneMasked?: string; devCode?: string }
  | { ok: false; error: string; message?: string }
> {
  const session = readOpsSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.sessionToken) {
    headers.Authorization = `Bearer ${session.sessionToken}`
  }

  const paths = ['/api/meoo-ops-delete-sms-send']
  let lastError = 'send_failed'
  for (const path of paths) {
    try {
      const res = await fetchOpsErpApi(path, { method: 'POST', headers, body: '{}' }, { ecsOnly: false })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        message?: string
        phoneMasked?: string
        devCode?: string
      }
      if (res.ok && j.ok !== false) {
        return {
          ok: true,
          message: j.message ?? '验证码已发送',
          phoneMasked: j.phoneMasked,
          devCode: j.devCode,
        }
      }
      lastError = j.message ?? j.error ?? `http_${res.status}`
    } catch {
      /* try next */
    }
  }
  return { ok: false, error: lastError, message: lastError }
}
