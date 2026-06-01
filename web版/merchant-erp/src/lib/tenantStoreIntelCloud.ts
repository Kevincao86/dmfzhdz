/**
 * 门店毛利/类目、菜单价目 → Supabase tenant_store_intel（与浏览器 localStorage 双写，供小程序与 AI 网关读取）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPrimaryTenantId } from './tenantBilling'
import { readStoreMarginConfig } from './storeMarginsRead'
import { loadStoreMenuRecord, type StoreMenuItem } from './storeMenuStorage'

export type TenantStoreIntelRow = {
  tenant_id: string
  margin_config: Record<string, unknown> | null
  menu_items: StoreMenuItem[]
  menu_store_name: string | null
  menu_item_count: number
  updated_at: string
}

function menuItemsForCloud(items: StoreMenuItem[]): StoreMenuItem[] {
  return items.slice(0, 200).map((it) => ({
    name: it.name,
    ...(it.productCode ? { productCode: it.productCode } : {}),
    ...(typeof it.priceYuan === 'number' ? { priceYuan: it.priceYuan } : {}),
    ...(it.category ? { category: it.category } : {}),
    ...(it.note ? { note: it.note } : {}),
  }))
}

/** 将当前租户 localStorage 中的毛利/菜单备份到云端（已有云端数据时不覆盖较新的本地以外的逻辑：始终 upsert 最新本地） */
export async function pushLocalStoreIntelToCloud(
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return { ok: false, message: '当前账号未关联商户租户' }

  const marginCfg = readStoreMarginConfig()
  const { items: menuItems, storeName } = await resolveMenuForCloudUpsert(supabase, tenantId)

  const row = {
    tenant_id: tenantId,
    margin_config: {
      margins: marginCfg.margins,
      industry: marginCfg.industry,
    },
    menu_items: menuItems,
    menu_store_name: storeName,
    menu_item_count: menuItems.length,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('tenant_store_intel').upsert(row, { onConflict: 'tenant_id' })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

export async function upsertMarginConfigCloud(
  supabase: SupabaseClient,
  marginConfig: Record<string, unknown>,
): Promise<void> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return
  const { items: menuItems, storeName } = await resolveMenuForCloudUpsert(supabase, tenantId)
  await supabase.from('tenant_store_intel').upsert(
    {
      tenant_id: tenantId,
      margin_config: marginConfig,
      menu_items: menuItems,
      menu_store_name: storeName,
      menu_item_count: menuItems.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
}

/** 从 Supabase 恢复菜单价目（localStorage 为空或切换设备时使用） */
export async function loadMenuRecordFromCloud(
  supabase: SupabaseClient,
): Promise<{ items: StoreMenuItem[]; storeName?: string; updatedAt?: string } | null> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return null
  return loadMenuRecordFromCloudForTenant(supabase, tenantId)
}

async function loadMenuRecordFromCloudForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ items: StoreMenuItem[]; storeName?: string; updatedAt?: string } | null> {
  const { data, error } = await supabase
    .from('tenant_store_intel')
    .select('menu_items, menu_store_name, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error || !data) return null
  const raw = data.menu_items
  if (!Array.isArray(raw) || raw.length === 0) return null
  const items: StoreMenuItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = String(r.name ?? '').trim()
    if (!name) continue
    items.push({
      name,
      ...(typeof r.productCode === 'string' && r.productCode.trim()
        ? { productCode: r.productCode.trim() }
        : {}),
      ...(typeof r.priceYuan === 'number' && Number.isFinite(r.priceYuan)
        ? { priceYuan: r.priceYuan }
        : {}),
      ...(typeof r.category === 'string' && r.category.trim()
        ? { category: r.category.trim() }
        : {}),
      ...(typeof r.note === 'string' && r.note.trim() ? { note: r.note.trim() } : {}),
    })
  }
  if (items.length === 0) return null
  return {
    items,
    storeName: typeof data.menu_store_name === 'string' ? data.menu_store_name.trim() : undefined,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  }
}

/** 本地菜单尚未就绪时保留云端已有价目，避免毛利同步等操作误清空 menu_items */
async function resolveMenuForCloudUpsert(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ items: StoreMenuItem[]; storeName: string | null }> {
  const menu = loadStoreMenuRecord()
  let items = menuItemsForCloud(menu?.items ?? [])
  let storeName = menu?.storeName?.trim() || null
  if (items.length === 0) {
    const cloud = await loadMenuRecordFromCloudForTenant(supabase, tenantId)
    if (cloud?.items.length) {
      items = menuItemsForCloud(cloud.items)
      storeName = cloud.storeName ?? storeName
    }
  }
  return { items, storeName }
}

export async function upsertMenuItemsCloud(
  supabase: SupabaseClient,
  menuItems: StoreMenuItem[],
  storeName?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) {
    return { ok: false, message: '当前账号未关联商户租户，价目无法同步云端' }
  }
  const marginCfg = readStoreMarginConfig()
  const items = menuItemsForCloud(menuItems)
  const { error } = await supabase.from('tenant_store_intel').upsert(
    {
      tenant_id: tenantId,
      margin_config: {
        margins: marginCfg.margins,
        industry: marginCfg.industry,
      },
      menu_items: items,
      menu_store_name: storeName?.trim() || null,
      menu_item_count: items.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}
