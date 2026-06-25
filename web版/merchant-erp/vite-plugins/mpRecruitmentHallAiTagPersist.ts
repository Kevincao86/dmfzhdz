import type { RegistrySnapshot } from '../src/lib/opsRegistryTypes.js'
import { fallbackOrderHighlightTag, withHallAiTagColors, type OrderMatchPayload } from '../src/lib/mpRecruitmentMatchShared.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import { runMpRecruitmentAiCore, type MpRecruitmentAiOrderInput } from './mpRecruitmentAiCore.js'
import type { AiTokenUsageRecordOpts } from './aiTokenUsageCore.js'

export type HallAiTagRecord = {
  tag: string
  tone: string
  bg: string
  fg: string
  provider?: string
  taggedAt: string
}

export function readHallAiTagFromMp(mp: Record<string, unknown> | null | undefined): HallAiTagRecord | null {
  if (!mp) return null
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const raw = meta?.hallAiTag
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const tag = String(t.tag || '').trim().slice(0, 6)
  if (!tag) return null
  const tone = String(t.tone || 'default').trim().slice(0, 16) || 'default'
  const styled = withHallAiTagColors(tag, tone, {
    bg: String(t.bg || '').trim(),
    fg: String(t.fg || '').trim(),
  })
  return {
    tag: styled.aiTag,
    tone: styled.aiTagTone,
    bg: styled.aiTagBg,
    fg: styled.aiTagFg,
    provider: String(t.provider || '').trim() || undefined,
    taggedAt: String(t.taggedAt || '').trim() || '',
  }
}

function stampNow() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

export function applyHallAiTagsToSnapshot(
  data: RegistrySnapshot,
  updates: Array<{ id: string; tag: string; tone: string; bg?: string; fg?: string; provider?: string }>,
): number {
  let n = 0
  const now = stampNow()
  for (const u of updates) {
    const id = String(u.id || '').trim()
    if (!id || !u.tag) continue
    const idx = data.mpRecruitmentOrders?.findIndex((o) => o && o.id === id) ?? -1
    if (idx < 0 || !data.mpRecruitmentOrders) continue
    const cur = data.mpRecruitmentOrders[idx]!
    const prevMeta =
      cur.mpPublishMeta && typeof cur.mpPublishMeta === 'object'
        ? (cur.mpPublishMeta as Record<string, unknown>)
        : {}
    if (readHallAiTagFromMp(cur as unknown as Record<string, unknown>)) continue
    const styled = withHallAiTagColors(u.tag, u.tone || 'default', { bg: u.bg, fg: u.fg })
    data.mpRecruitmentOrders[idx] = {
      ...cur,
      mpPublishMeta: {
        ...prevMeta,
        hallAiTag: {
          tag: styled.aiTag,
          tone: styled.aiTagTone,
          bg: styled.aiTagBg,
          fg: styled.aiTagFg,
          provider: u.provider || '',
          taggedAt: now,
        },
      },
      updatedAt: now,
    }
    n += 1
  }
  return n
}

/** tag 模式：已打标商单直接读库，仅对新单调 LLM 并写回注册表（永久固定，不重复消耗 token） */
export async function runTagModeWithPersist(
  bodyRaw: string,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  let body: { mode?: string; provider?: string; orders?: MpRecruitmentAiOrderInput[] }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }

  const orders = Array.isArray(body.orders) ? body.orders.filter((o) => o && o.id) : []
  if (!orders.length) {
    return { status: 400, body: { ok: false, error: 'orders_required' } }
  }

  const cachedItems: Array<{ id: string; tag: string; tone: string; bg: string; fg: string; source: 'persisted' }> = []
  const needAi: MpRecruitmentAiOrderInput[] = []
  const mpById = new Map<string, Record<string, unknown>>()

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length === 0) {
    try {
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      for (const mp of data.mpRecruitmentOrders ?? []) {
        if (!mp?.id) continue
        mpById.set(mp.id, mp as unknown as Record<string, unknown>)
      }
    } catch {
      /* 注册表不可读时仍可对未缓存单走 AI */
    }
  }

  for (const o of orders) {
    const mp = mpById.get(String(o.id))
    const hit = readHallAiTagFromMp(mp)
    if (hit) {
      cachedItems.push({
        id: String(o.id),
        tag: hit.tag,
        tone: hit.tone,
        bg: hit.bg,
        fg: hit.fg,
        source: 'persisted',
      })
    } else {
      needAi.push(o)
    }
  }

  const freshItems: Array<{ id: string; tag: string; tone: string; bg: string; fg: string; provider?: string }> = []
  let provider = ''
  if (needAi.length) {
    const aiBody = JSON.stringify({ ...body, mode: 'tag', orders: needAi })
    const aiOut = await runMpRecruitmentAiCore(aiBody, env, usageRecord)
    if (aiOut.status !== 200 || aiOut.body.ok === false) {
      const fallbackItems = needAi
        .map((o) => {
          const fb = fallbackOrderHighlightTag(o as OrderMatchPayload)
          const styled = withHallAiTagColors(fb.aiTag, fb.aiTagTone)
          return {
            id: String(o.id),
            tag: styled.aiTag,
            tone: styled.aiTagTone,
            bg: styled.aiTagBg,
            fg: styled.aiTagFg,
            provider: 'fallback',
          }
        })
        .filter((x) => x.id && x.tag)
      freshItems.push(...fallbackItems)
    } else {
      const items = Array.isArray(aiOut.body.items) ? aiOut.body.items : []
      provider = String(aiOut.body.provider || '')
      for (const it of items) {
        const row = it as Record<string, unknown>
        const id = String(row.id || '').trim()
        const tag = String(row.tag || '').trim()
        if (!id || !tag) continue
        const tone = String(row.tone || 'default').trim() || 'default'
        const styled = withHallAiTagColors(tag, tone, {
          bg: String(row.bg || '').trim(),
          fg: String(row.fg || '').trim(),
        })
        freshItems.push({
          id,
          tag: styled.aiTag,
          tone: styled.aiTagTone,
          bg: styled.aiTagBg,
          fg: styled.aiTagFg,
          provider,
        })
      }
    }

    if (freshItems.length && missingParts.length === 0) {
      try {
        const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
        const data = await io.load()
        const saved = applyHallAiTagsToSnapshot(data, freshItems)
        if (saved > 0) await io.save(data)
      } catch (e) {
        console.warn('[mpRecruitmentHallAiTagPersist] save failed', e)
      }
    }
  }

  const items = [
    ...cachedItems.map((c) => ({
      id: c.id,
      tag: c.tag,
      tone: c.tone,
      bg: c.bg,
      fg: c.fg,
      source: c.source,
    })),
    ...freshItems.map((f) => ({
      id: f.id,
      tag: f.tag,
      tone: f.tone,
      bg: f.bg,
      fg: f.fg,
      source: 'ai' as const,
      provider: f.provider,
    })),
  ]

  return {
    status: 200,
    body: {
      ok: true,
      mode: 'tag',
      provider: provider || undefined,
      persisted: cachedItems.length,
      generated: freshItems.length,
      items,
    },
  }
}
