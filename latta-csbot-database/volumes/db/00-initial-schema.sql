-- Create auth schema (required by Supabase Auth service)
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT ALL ON SCHEMA auth TO postgres;

-- Create extensions schema (required by other init scripts)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT ALL ON SCHEMA extensions TO postgres;

-- Create supabase_admin role (required by other init scripts)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE USER supabase_admin WITH SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS;
  END IF;
END
$$;
