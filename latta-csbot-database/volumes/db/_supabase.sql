-- Create _supabase database for analytics
-- This runs in init-scripts phase after postgres role exists

\c postgres
CREATE DATABASE _supabase;
\c _supabase
ALTER DATABASE _supabase OWNER TO supabase_admin;
