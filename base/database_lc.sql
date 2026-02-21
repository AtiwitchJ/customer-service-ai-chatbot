-- ===========================================
-- LATTA CSBOT - RAG Database Schema (Normalized V2)
-- Consolidated & Latest Version
-- ===========================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===========================================
-- 1. FILES TABLE (Source of truth for uploads)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    storage_id UUID,
    file_size BIGINT,
    mime_type TEXT,
    status TEXT DEFAULT 'uploading', -- uploading, extracting, embedding, done, error
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 2. DOCUMENTS TABLE (Metadata & Full Content)
-- Normalized: Removed redundant file_name, file_type, file_size, file_path
-- ===========================================
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- 3. DOCUMENT_CHUNKS TABLE (Embeddings)
-- Normalized: Removed redundant file_id (can join via documents -> files)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1024),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);



-- ===========================================
-- 5. INDEXES
-- ===========================================
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===========================================
-- 6. SEARCH FUNCTION (Normalized Join - LangChain Compatible)
-- ===========================================
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding VECTOR(1024),
    match_count INT DEFAULT 5,
    filter JSONB DEFAULT '{}',
    match_threshold FLOAT DEFAULT 0.1
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    file_id UUID,
    file_name TEXT,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
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

-- ===========================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ===========================================
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;


-- Allow service role full access (Broad permissive policies for now)
CREATE POLICY "Service role has full access to files" ON public.files FOR ALL USING (true);
CREATE POLICY "Service role has full access to documents" ON public.documents FOR ALL USING (true);
CREATE POLICY "Service role has full access to document_chunks" ON public.document_chunks FOR ALL USING (true);




-- ===========================================
-- 9. STORAGE BUCKETS
-- ===========================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('file_rag', 'file_rag', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('image_rag', 'image_rag', true) 
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- DONE
-- ===========================================
SELECT '✅ Database Schema & Buckets Reconciled Successfully!' as status;