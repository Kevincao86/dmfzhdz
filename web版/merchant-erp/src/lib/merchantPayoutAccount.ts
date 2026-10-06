/**
 * 商家钱包收款账户。提现申请快照这份账户，运营打款按快照上的户名、账号、开户行。
 */
import type { RegistryFile } from './opsRegistryTypes.js'

export type MerchantPayoutKind = 'person' | 'entity'

export type MerchantPayoutAccount = {
  ownerKey: string
  kind: MerchantPayoutKind
  payeeName: string
  bank: string
  bankNo: string
  updatedAt: string
}

export type MerchantPayoutAccountPublic = {
  kind: MerchantPayoutKind
  payeeName: string
  bank: string
  bankNo: string
  updatedAt: string
}

function clip(raw: unknown, max: number): string {
  return String(raw ?? '').trim().slice(0, max)
}

export function readMerchantPayoutAccounts(raw: unknown): MerchantPayoutAccount[] {
  if (!Array.isArray(raw)) return []
  const out: MerchantPayoutAccount[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const ownerKey = clip(item.ownerKey, 80)
    const payeeName = clip(item.payeeName, 40)
    const bank = clip(item.bank, 40)
    const bankNo = clip(item.bankNo, 40).replace(/\s+/g, '')
    if (!ownerKey || !payeeName || !bank || bankNo.length < 6) continue
    out.push({
      ownerKey,
      kind: item.kind === 'entity' ? 'entity' : 'person',
      payeeName,
      bank,
      bankNo,
      updatedAt: clip(item.updatedAt, 40),
    })
  }
  return out.slice(0, 20_000)
}

export function toPublicPayoutAccount(account: MerchantPayoutAccount): MerchantPayoutAccountPublic {
  return {
    kind: account.kind,
    payeeName: account.payeeName,
    bank: account.bank,
    bankNo: account.bankNo,
    updatedAt: account.updatedAt,
  }
}

export function findMerchantPayoutAccount(
  data: RegistryFile,
  ownerKey: string,
): MerchantPayoutAccount | null {
  const key = clip(ownerKey, 80)
  if (!key) return null
  return readMerchantPayoutAccounts(data.merchantPayoutAccounts).find((row) => row.ownerKey === key) ?? null
}

export function upsertMerchantPayoutAccount(
  data: RegistryFile,
  ownerKey: string,
  body: Record<string, unknown>,
):
  | { ok: true; account: MerchantPayoutAccount }
  | { ok: false; error: string; message: string } {
  const key = clip(ownerKey, 80)
  if (!key) return { ok: false, error: 'unauthorized', message: '请先登录' }
  const payeeName = clip(body.payeeName, 40)
  const bank = clip(body.bank, 40)
  const bankNo = clip(body.bankNo, 40).replace(/\s+/g, '')
  if (!payeeName) return { ok: false, error: 'invalid_fields', message: '请填写收款户名' }
  if (!bank) return { ok: false, error: 'invalid_fields', message: '请填写开户行' }
  if (bankNo.length < 6) return { ok: false, error: 'invalid_fields', message: '请填写有效收款账号' }
  const account: MerchantPayoutAccount = {
    ownerKey: key,
    kind: body.kind === 'entity' ? 'entity' : 'person',
    payeeName,
    bank,
    bankNo,
    updatedAt: new Date().toISOString(),
  }
  const list = readMerchantPayoutAccounts(data.merchantPayoutAccounts).filter((row) => row.ownerKey !== key)
  list.unshift(account)
  data.merchantPayoutAccounts = list
  return { ok: true, account }
}

export function payoutAccountSnapshot(account: MerchantPayoutAccount): Record<string, string> {
  return {
    kind: account.kind,
    payeeName: account.payeeName,
    bank: account.bank,
    bankNo: account.bankNo,
  }
}
