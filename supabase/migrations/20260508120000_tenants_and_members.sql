-- 多租户：租户表 + 成员关系；RLS 按 auth.uid() 限制可见范围。
-- 运行：Supabase SQL Editor 粘贴执行，或 supabase db push（已 link 项目后）

create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_status text not null default 'normal'
    check (account_status in ('normal', 'disabled', 'frozen')),
  trial_days integer not null default 0,
  official_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists tenant_members_user_id_idx on public.tenant_members (user_id);
create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

-- 成员只能读自己的 membership 行
create policy "tenant_members_select_self"
  on public.tenant_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- 通过 membership 读租户
create policy "tenants_select_via_membership"
  on public.tenants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_members m
      where m.tenant_id = tenants.id
        and m.user_id = auth.uid()
    )
  );

-- 禁止客户端直接插入/更新（由 Service Role / Edge Function 写入）
-- 如需运营员在 SQL 中手工修正，可临时使用 service_role。
