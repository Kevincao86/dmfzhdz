-- ECS 自建 PostgREST：service_role 有 GRANT 但仍受 RLS 约束，须显式 policy（否则微信登录写注册表 42501）
-- 应用：bash scripts/ecs-fix-ops-registry-rls.sh

drop policy if exists "ops_registry_snapshot_service_role_all" on public.ops_registry_snapshot;

create policy "ops_registry_snapshot_service_role_all"
  on public.ops_registry_snapshot
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on table public.ops_registry_snapshot to service_role;
