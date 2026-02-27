-- Create _supavisor schema for pooler
\c _supabase
CREATE SCHEMA IF NOT EXISTS _supavisor;
ALTER SCHEMA _supavisor OWNER TO supabase_admin;
\c postgres
