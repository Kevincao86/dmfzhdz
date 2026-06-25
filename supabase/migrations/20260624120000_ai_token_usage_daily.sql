-- 租户 / 星选账号 AI Token 日汇总（按 provider+model 分桶）
-- ECS: bash scripts/ecs-fix-ai-token-usage.sh

create table if not exists public.ai_token_usage_daily (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('tenant', 'mp_account')),
  scope_id uuid not null,
  usage_date date not null,
  provider text not null default 'unknown',
  model text not null default '',
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  call_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, usage_date, provider, model)
);

create index if not exists ai_token_usage_daily_scope_date_idx
  on public.ai_token_usage_daily (scope_type, scope_id, usage_date desc);

comment on table public.ai_token_usage_daily is 'AI 模型 Token 日汇总：tenant=商家 ERP 主账号；mp_account=星选平台账号';

create or replace function public.increment_ai_token_usage(
  p_scope_type text,
  p_scope_id uuid,
  p_usage_date date,
  p_provider text,
  p_model text,
  p_prompt bigint,
  p_completion bigint,
  p_total bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_token_usage_daily (
    scope_type, scope_id, usage_date, provider, model,
    prompt_tokens, completion_tokens, total_tokens, call_count, updated_at
  ) values (
    p_scope_type, p_scope_id, p_usage_date,
    coalesce(nullif(trim(p_provider), ''), 'unknown'),
    coalesce(left(trim(p_model), 120), ''),
    greatest(0, coalesce(p_prompt, 0)),
    greatest(0, coalesce(p_completion, 0)),
    greatest(0, coalesce(p_total, 0)),
    1,
    now()
  )
  on conflict (scope_type, scope_id, usage_date, provider, model)
  do update set
    prompt_tokens = ai_token_usage_daily.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = ai_token_usage_daily.completion_tokens + excluded.completion_tokens,
    total_tokens = ai_token_usage_daily.total_tokens + excluded.total_tokens,
    call_count = ai_token_usage_daily.call_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.increment_ai_token_usage(text, uuid, date, text, text, bigint, bigint, bigint) from public;
grant execute on function public.increment_ai_token_usage(text, uuid, date, text, text, bigint, bigint, bigint) to service_role;

alter table public.ai_token_usage_daily enable row level security;

create policy "ai_token_usage_tenant_members_select"
  on public.ai_token_usage_daily
  for select
  to authenticated
  using (
    scope_type = 'tenant'
    and exists (
      select 1 from public.tenant_members m
      where m.tenant_id = ai_token_usage_daily.scope_id
        and m.user_id = auth.uid()
    )
  );

grant select on public.ai_token_usage_daily to authenticated;
grant select, insert, update, delete on public.ai_token_usage_daily to service_role;
