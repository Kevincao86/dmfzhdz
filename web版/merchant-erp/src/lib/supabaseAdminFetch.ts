/**
 * 方案 B：Vercel Serverless 直连轻量 Supabase（GoTrue / PostgREST）。
 * SUPABASE_URL=https://mofangdianai.com；备案期经 erpHttpsDualFetch → HTTP:80 IP bypass。
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
