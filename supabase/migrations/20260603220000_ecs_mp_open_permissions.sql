-- ECS 备案期：小程序相关表关闭 RLS，避免 PostgREST service_role 仍报 42501/23505
-- 执行：bash scripts/ecs-fix-mp-open-all-permissions.sh

alter table if exists public.ops_registry_snapshot disable row level security;

alter table if exists public.mp_accounts disable row level security;
alter table if exists public.mp_auth_sessions disable row level security;
alter table if exists public.mp_wx_scan_tickets disable row level security;

alter table if exists public.mp_talent_chat_participants disable row level security;
alter table if exists public.mp_talent_chat_sessions disable row level security;
alter table if exists public.mp_talent_chat_messages disable row level security;

grant usage on schema public to service_role, anon, authenticated;
grant select, insert, update, delete on table public.ops_registry_snapshot to service_role;
grant select, insert, update, delete on table public.mp_accounts to service_role;
grant select, insert, update, delete on table public.mp_auth_sessions to service_role;
grant select, insert, update, delete on table public.mp_wx_scan_tickets to service_role;
grant select, insert, update, delete on table public.mp_talent_chat_participants to service_role;
grant select, insert, update, delete on table public.mp_talent_chat_sessions to service_role;
grant select, insert, update, delete on table public.mp_talent_chat_messages to service_role;
