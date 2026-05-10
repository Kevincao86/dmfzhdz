-- 显式授权：确保 service_role 可读写注册表快照（线上 /api/ops-sync 依赖）
grant select, insert, update, delete on table public.ops_registry_snapshot to service_role;
