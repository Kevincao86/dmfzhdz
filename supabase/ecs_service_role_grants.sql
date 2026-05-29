-- 自建 ECS PostgREST：service_role 需显式 GRANT 才能写入 tenants 等表
-- 在 ECS 执行：sudo -u postgres psql -p 5433 -f ~/app/supabase/ecs_service_role_grants.sql

GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- 客户端 anon / authenticated 按需只读（RLS 仍生效）
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
