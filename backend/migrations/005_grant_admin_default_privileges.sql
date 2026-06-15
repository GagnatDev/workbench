-- Up Migration

-- Resolve recurring scaleway_rdb_privilege drift for the admin user (homectl-infra #18).
-- Migrations run as the per-app `workbench` role, which owns every object. The infra
-- grants the admin role `homectl` `all` on this database, but that grant only covers
-- objects existing at apply time, so each later migration drifts the effective grant to
-- `custom` and `terraform plan` warns on every PR.
--
-- The one-shot GRANT fixes objects that already exist; ALTER DEFAULT PRIVILEGES makes
-- `workbench`'s future objects auto-grant to the admin role, killing the drift for good.
-- A role may always alter its own default privileges, so this runs fine as `workbench`.
--
-- Guarded on role existence: local dev (role `workbench`) and CI (Testcontainers' `test`
-- role) have no admin role, so this is a no-op there and only acts in production.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'homectl') THEN
    EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO homectl';
    EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO homectl';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE workbench IN SCHEMA public GRANT ALL ON TABLES TO homectl';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE workbench IN SCHEMA public GRANT ALL ON SEQUENCES TO homectl';
  END IF;
END $$;
