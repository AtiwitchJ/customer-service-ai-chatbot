-- ===========================================
-- Analytics Database Schema
-- ===========================================

\c _supabase
create schema if not exists _analytics;
alter schema _analytics owner to supabase_admin;

-- Create sources table for Logflare
CREATE TABLE IF NOT EXISTS sources (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    service_name TEXT NOT NULL,
    token TEXT NOT NULL,
    public_token TEXT,
    favorite BOOLEAN DEFAULT false,
    bigquery_table_ttl TEXT,
    api_quota INTEGER DEFAULT 10000,
    webhook_notification_url TEXT,
    slack_hook_url TEXT,
    bq_table_partition_type TEXT,
    bq_storage_write_api BOOLEAN DEFAULT false,
    custom_event_message_keys TEXT,
    log_events_updated_at TIMESTAMP,
    notifications_every INTEGER DEFAULT 0,
    lock_schema BOOLEAN DEFAULT false,
    validate_schema BOOLEAN DEFAULT true,
    drop_lql_filters BOOLEAN DEFAULT false,
    drop_lql_string TEXT,
    disable_tailing BOOLEAN DEFAULT false,
    suggested_keys TEXT[],
    transform_copy_fields TEXT[],
    bigquery_clustering_fields TEXT[],
    system_source BOOLEAN DEFAULT false,
    system_source_type TEXT,
    labels JSONB DEFAULT '{}',
    user_id UUID REFERENCES auth.users(id),
    notifications JSONB DEFAULT '{}',
    inserted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create system_metrics table for Logflare
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    all_logs_logged BIGINT DEFAULT 0,
    node TEXT NOT NULL,
    inserted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_name ON sources(name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_node ON system_metrics(node);

-- Grant access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA _analytics TO supabase_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA _analytics TO supabase_admin;

\c postgres
