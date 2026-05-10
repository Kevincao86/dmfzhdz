/**
 * Vercel Edge：转发「手动创建租户」到 Supabase Edge Function（密钥仅在服务端环境变量）。
 * 本地开发仍由 vite-plugins/provisionTenantProxy 处理同源 POST。
 */
export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const secret = process.env.MEOO_PROVISION_SECRET

  if (!supabaseUrl?.trim() || !anon?.trim() || !secret?.trim()) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'provision_not_configured',
        hint:
          '在 Vercel 环境变量中配置 MEOO_PROVISION_SECRET，以及 VITE_SUPABASE_URL（或 SUPABASE_URL）与 SUPABASE_ANON_KEY（或 VITE_SUPABASE_ANON_KEY）；并部署 Edge Function provision-tenant。',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }

  const body = await req.text()

  try {
    const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/provision-tenant`
    const upstream = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        'x-meoo-provision-secret': secret,
      },
      body,
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'provision_upstream_failed',
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
}
