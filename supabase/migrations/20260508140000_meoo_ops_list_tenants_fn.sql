-- 供运营管控台 dev 代理使用 service_role 调用：列出租户 + 主账号登录名（auth.users）
create or replace function public.meoo_ops_list_tenants()
returns table (
  tenant_id uuid,
  merchant_name text,
  login_name text,
  user_email text,
  account_status text,
  trial_days integer,
  official_days integer,
  created_at timestamptz,
  updated_at timestamptz,
  owner_user_id uuid
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    t.id,
    t.name,
    coalesce(u.raw_user_meta_data->>'login_name', split_part(u.email::text, '@', 1)),
    u.email::text,
    t.account_status::text,
    t.trial_days,
    t.official_days,
    t.created_at,
    t.updated_at,
    m.user_id
  from public.tenants t
  inner join public.tenant_members m on m.tenant_id = t.id and m.role = 'owner'
  inner join auth.users u on u.id = m.user_id;
$$;

revoke all on function public.meoo_ops_list_tenants() from public;
grant execute on function public.meoo_ops_list_tenants() to service_role;
