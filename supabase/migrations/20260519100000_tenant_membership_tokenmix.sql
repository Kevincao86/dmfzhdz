-- 租户会员档位、TokenMix 密钥（仅 service_role 可读）、直连 AI 用量计数

alter table public.tenants
  add column if not exists membership_plan text not null default 'member'
    check (membership_plan in ('free', 'member', 'member_plus'));

alter table public.tenants
  add column if not exists tokenmix_api_key text;

alter table public.tenants
  add column if not exists direct_ai_calls_used integer not null default 0;

alter table public.tenants
  add column if not exists direct_ai_usage_month text;

alter table public.tenants
  add column if not exists tokenmix_usage_snapshot jsonb;

comment on column public.tenants.membership_plan is 'free | member(168) | member_plus(598)';
comment on column public.tenants.tokenmix_api_key is '运营台绑定的 TokenMix API Key，勿暴露给 authenticated 客户端';
comment on column public.tenants.direct_ai_calls_used is '免费版当月豆包/千问/MiniMax/DeepSeek 调用次数';
comment on column public.tenants.direct_ai_usage_month is '用量计数所属月份 YYYY-MM';
comment on column public.tenants.tokenmix_usage_snapshot is '运营台同步的 TokenMix 限额/用量快照';

-- 客户端 JWT 不可读取 tokenmix_api_key / tokenmix_usage_snapshot
revoke select on table public.tenants from authenticated;
grant select (
  id, name, account_status, trial_days, official_days, created_at, updated_at,
  wallet_balance_cents, service_expire_at,
  membership_plan, direct_ai_calls_used, direct_ai_usage_month
) on public.tenants to authenticated;
