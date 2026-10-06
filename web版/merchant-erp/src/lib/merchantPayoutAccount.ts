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
  idName: string
  idNo: string
  idFront: string
  idBack: string
  licenseNo: string
  licenseImage: string
  updatedAt: string
}

export type MerchantPayoutAccountPublic = {
  kind: MerchantPayoutKind
  payeeName: string
  bank: string
  bankNo: string
  idName: string
  idNo: string
  idFront: string
  idBack: string
  licenseNo: string
  licenseImage: string
  updatedAt: string
}

function clip(raw: unknown, max: number): string {
  return String(raw ?? '').trim().slice(0, max)
}

function clipImage(raw: unknown): string {
  const value = String(raw ?? '')
  if (!value.startsWith('data:image/')) return ''
  return value.slice(0, 280000)
}

const ID_NO = /^(\d{15}|\d{17}[\dXx])$/

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
      idName: clip(item.idName, 40),
      idNo: clip(item.idNo, 18),
      idFront: clipImage(item.idFront),
      idBack: clipImage(item.idBack),
      licenseNo: clip(item.licenseNo, 18),
      licenseImage: clipImage(item.licenseImage),
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
    idName: account.idName,
    idNo: account.idNo,
    idFront: account.idFront,
    idBack: account.idBack,
    licenseNo: account.licenseNo,
    licenseImage: account.licenseImage,
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
  const kind: MerchantPayoutKind = body.kind === 'entity' ? 'entity' : 'person'
  const payeeName = clip(body.payeeName, 40)
  const bank = clip(body.bank, 40)
  const bankNo = clip(body.bankNo, 40).replace(/\s+/g, '')
  const idName = clip(body.idName, 40)
  const idNo = clip(body.idNo, 18)
  const idFront = clipImage(body.idFront)
  const idBack = clipImage(body.idBack)
  const licenseNo = clip(body.licenseNo, 18)
  const licenseImage = clipImage(body.licenseImage)
  if (!idFront || !idBack) return { ok: false, error: 'invalid_fields', message: '请上传身份证人像面和国徽面' }
  if (kind === 'entity' && !licenseImage) return { ok: false, error: 'invalid_fields', message: '请上传营业执照' }
  if (!idName) return { ok: false, error: 'invalid_fields', message: '请填写姓名' }
  if (!ID_NO.test(idNo)) return { ok: false, error: 'invalid_fields', message: '请填写正确的身份证号' }
  if (!payeeName || bankNo.length < 6) return { ok: false, error: 'invalid_fields', message: '请填写户名和账号' }
  if (!bank) return { ok: false, error: 'invalid_fields', message: '请填写开户行' }
  if (kind === 'entity' && !licenseNo) return { ok: false, error: 'invalid_fields', message: '请填写统一社会信用代码' }
  const account: MerchantPayoutAccount = {
    ownerKey: key,
    kind,
    payeeName,
    bank,
    bankNo,
    idName,
    idNo,
    idFront,
    idBack,
    licenseNo: kind === 'entity' ? licenseNo : '',
    licenseImage: kind === 'entity' ? licenseImage : '',
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
