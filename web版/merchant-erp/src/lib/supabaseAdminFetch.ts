/**
 * Vercel Serverless 访问 ECS 自建 Supabase（GoTrue / PostgREST）。
 * 备案期外网 SNI 域名会被 reset，经 erpHttpsDualFetch 改连 IP + Host 头。
 */
import { erpAwareFetch } from './erpHttpsDualFetch.js'

const ECS_SUPABASE_HOSTS = /^(mofangdianai\.com|api\.mofangdianai\.com)$/i

export function isEcsSupabaseAdminHost(url: string): boolean {
  try {
    return ECS_SUPABASE_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** 替换裸 fetch：ECS 根域走 IP 备案 bypass，其它 URL 不变 */
export function supabaseAdminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (isEcsSupabaseAdminHost(url)) {
    return erpAwareFetch(url, init)
  }
  return fetch(url, init)
}
