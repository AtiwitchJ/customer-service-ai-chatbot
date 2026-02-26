-- ===========================================
-- LATTA CSBOT - RAG Database Schema
-- Extracted from backup (1).sql
-- PostgreSQL version: 15.8
-- ===========================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;

-- ===========================================
-- 1. FILES TABLE
-- ===========================================
CREATE TABLE public.files (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    storage_id uuid,
    file_size bigint,
    mime_type text,
    status text DEFAULT 'uploading'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.files OWNER TO supabase_admin;

-- ===========================================
-- 2. DOCUMENTS TABLE
-- ===========================================
CREATE TABLE public.documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    file_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    content text,
    chunk_count integer DEFAULT 0,
    status text DEFAULT 'pending'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE public.documents OWNER TO supabase_admin;

-- ===========================================
-- 3. DOCUMENT_CHUNKS TABLE (Embeddings)
-- ===========================================
CREATE TABLE public.document_chunks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1024),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.document_chunks OWNER TO supabase_admin;

-- ===========================================
-- 4. FOREIGN KEYS
-- ===========================================
ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

-- ===========================================
-- 5. INDEXES
-- ===========================================
CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);
CREATE INDEX idx_documents_status ON public.documents USING btree (status);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks USING btree (document_id);
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');

-- ===========================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ===========================================
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role has full access to files" ON public.files USING (true);
CREATE POLICY "Service role has full access to documents" ON public.documents USING (true);
CREATE POLICY "Service role has full access to document_chunks" ON public.document_chunks USING (true);

-- ===========================================
-- 7. SEARCH FUNCTION (LangChain Compatible)
-- ===========================================
CREATE FUNCTION public.match_documents(query_embedding public.vector, match_count integer DEFAULT 5, filter jsonb DEFAULT '{}'::jsonb, match_threshold double precision DEFAULT 0.1) RETURNS TABLE(id uuid, document_id uuid, file_id uuid, file_name text, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        d.file_id,
        f.file_name,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    JOIN public.files f ON d.file_id = f.id
    WHERE (1 - (dc.embedding <=> query_embedding) > match_threshold)
      AND (filter = '{}' OR dc.metadata @> filter)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

ALTER FUNCTION public.match_documents(query_embedding public.vector, match_count integer, filter jsonb, match_threshold double precision) OWNER TO supabase_admin;

-- ===========================================
-- 8. STORAGE BUCKETS
-- ===========================================
INSERT INTO storage.buckets (id, name, public, created_at, updated_at, type)
VALUES ('file_rag', 'file_rag', true, NOW(), NOW(), 'STANDARD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, created_at, updated_at, type)
VALUES ('image_rag', 'image_rag', true, NOW(), NOW(), 'STANDARD')
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 9. GRANTS
-- ===========================================
GRANT ALL ON TABLE public.files TO supabase_admin;
GRANT ALL ON TABLE public.documents TO supabase_admin;
GRANT ALL ON TABLE public.document_chunks TO supabase_admin;

GRANT ALL ON TABLE public.files TO authenticated;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.document_chunks TO authenticated;

GRANT ALL ON TABLE public.files TO service_role;
GRANT ALL ON TABLE public.documents TO service_role;
GRANT ALL ON TABLE public.document_chunks TO service_role;

GRANT ALL ON FUNCTION public.match_documents TO supabase_admin;
GRANT ALL ON FUNCTION public.match_documents TO authenticated;
GRANT ALL ON FUNCTION public.match_documents TO service_role;

-- ===========================================
-- DONE
-- ===========================================
SELECT '✅ RAG Database Schema Extracted Successfully!' as status;
