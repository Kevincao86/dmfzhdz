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
  const menu = loadStoreMenuRecord()
  const menuItems = menuItemsForCloud(menu?.items ?? [])

  const row = {
    tenant_id: tenantId,
    margin_config: {
      margins: marginCfg.margins,
      industry: marginCfg.industry,
    },
    menu_items: menuItems,
    menu_store_name: menu?.storeName?.trim() || null,
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
  const menu = loadStoreMenuRecord()
  const menuItems = menuItemsForCloud(menu?.items ?? [])
  await supabase.from('tenant_store_intel').upsert(
    {
      tenant_id: tenantId,
      margin_config: marginConfig,
      menu_items: menuItems,
      menu_store_name: menu?.storeName?.trim() || null,
      menu_item_count: menuItems.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
}

export async function upsertMenuItemsCloud(
  supabase: SupabaseClient,
  menuItems: StoreMenuItem[],
  storeName?: string,
): Promise<void> {
  const tenantId = await fetchPrimaryTenantId(supabase)
  if (!tenantId) return
  const marginCfg = readStoreMarginConfig()
  const items = menuItemsForCloud(menuItems)
  await supabase.from('tenant_store_intel').upsert(
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
}
