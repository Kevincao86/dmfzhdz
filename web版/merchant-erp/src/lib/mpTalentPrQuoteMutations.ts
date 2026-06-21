import type { RegistryFile } from './opsRegistryTypes.js'
import { findRegistryMemberForAccount } from './mpRegistryProfileGet.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { upsertMpTalentMember } from './mpTalentMemberUpsert.js'
import {
  sanitizeExclusiveQuotes,
  type MpTalentPrExclusiveQuote,
} from './mpTalentPrQuoteShared.js'

export function listMemberExclusiveQuotes(
  data: RegistryFile,
  account: MpAccountRow,
): MpTalentPrExclusiveQuote[] {
  const member = findRegistryMemberForAccount(data, account)
  return sanitizeExclusiveQuotes(member?.prExclusiveQuotes)
}

export function upsertMemberExclusiveQuote(
  data: RegistryFile,
  account: MpAccountRow,
  input: {
    prLingqiId: string
    prRegistryId?: string
    prDisplayName?: string
    platform: string
    quoteYuan: number
    note?: string
  },
): { ok: true; quotes: MpTalentPrExclusiveQuote[] } | { ok: false; error: string } {
  const member = findRegistryMemberForAccount(data, account)
  if (!member) return { ok: false, error: 'member_not_found' }
  const prLingqiId = String(input.prLingqiId || '').trim()
  const platform = String(input.platform || '').trim()
  const quoteYuan = Math.round(Number(input.quoteYuan))
  if (!prLingqiId || !platform || !Number.isFinite(quoteYuan) || quoteYuan <= 0) {
    return { ok: false, error: 'invalid_quote' }
  }
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const nextItem: MpTalentPrExclusiveQuote = {
    prLingqiId,
    prRegistryId: String(input.prRegistryId || '').trim() || undefined,
    prDisplayName: String(input.prDisplayName || '').trim() || undefined,
    platform,
    quoteYuan,
    note: String(input.note || '').trim() || undefined,
    updatedAt: now,
  }
  const prev = sanitizeExclusiveQuotes(member.prExclusiveQuotes)
  const idx = prev.findIndex(
    (q) => q.prLingqiId === prLingqiId && q.platform === platform,
  )
  const list = [...prev]
  if (idx >= 0) list[idx] = { ...list[idx]!, ...nextItem }
  else list.unshift(nextItem)
  const saved = upsertMpTalentMember(data, { ...member, prExclusiveQuotes: list.slice(0, 200) })
  return { ok: true, quotes: sanitizeExclusiveQuotes(saved.prExclusiveQuotes) }
}

export function deleteMemberExclusiveQuote(
  data: RegistryFile,
  account: MpAccountRow,
  input: { prLingqiId: string; platform: string },
): { ok: true; quotes: MpTalentPrExclusiveQuote[] } | { ok: false; error: string } {
  const member = findRegistryMemberForAccount(data, account)
  if (!member) return { ok: false, error: 'member_not_found' }
  const prLingqiId = String(input.prLingqiId || '').trim()
  const platform = String(input.platform || '').trim()
  if (!prLingqiId || !platform) return { ok: false, error: 'invalid_quote' }
  const prev = sanitizeExclusiveQuotes(member.prExclusiveQuotes)
  const list = prev.filter((q) => !(q.prLingqiId === prLingqiId && q.platform === platform))
  const saved = upsertMpTalentMember(data, { ...member, prExclusiveQuotes: list })
  return { ok: true, quotes: sanitizeExclusiveQuotes(saved.prExclusiveQuotes) }
}

export function replaceMemberExclusiveQuotes(
  data: RegistryFile,
  account: MpAccountRow,
  quotes: unknown,
): MpTalentPrExclusiveQuote[] {
  const member = findRegistryMemberForAccount(data, account)
  if (!member) return []
  const saved = upsertMpTalentMember(data, {
    ...member,
    prExclusiveQuotes: sanitizeExclusiveQuotes(quotes),
  })
  return sanitizeExclusiveQuotes(saved.prExclusiveQuotes)
}
