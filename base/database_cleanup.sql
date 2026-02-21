-- ===========================================
-- LATTA CSBOT - RAG Database Cleanup Script
-- Normalized Version
-- ===========================================

-- 1. Drop Functions (ครอบคลุมทั้งแบบดั้งเดิม และ แบบ LangChain)
-- แบบดั้งเดิม: match_documents(VECTOR, FLOAT, INT)
-- แบบ LangChain: match_documents(VECTOR, INT, JSONB, FLOAT)
DROP FUNCTION IF EXISTS public.match_documents(VECTOR, FLOAT, INT);
DROP FUNCTION IF EXISTS public.match_documents(VECTOR, INT, JSONB, FLOAT);
DROP FUNCTION IF EXISTS public.match_documents(VECTOR, INT, JSONB);
DROP FUNCTION IF EXISTS public.match_documents(VECTOR, INT);
DROP FUNCTION IF EXISTS public.match_documents();

-- 2. Drop Tables (Cascade จะลบ Indexes, Policies และ Triggers ที่เกี่ยวข้องด้วย)
DROP TABLE IF EXISTS public.document_chunks CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;

-- 3. Cleanup Storage Buckets (ลบข้อมูลไฟล์และ Bucket)
-- ต้องลบข้อมูลใน storage.objects ก่อน เพราะมี Foreign Key ผูกอยู่กับ storage.buckets
DELETE FROM storage.objects WHERE bucket_id IN ('file_rag', 'image_rag');
DELETE FROM storage.buckets WHERE id IN ('file_rag', 'image_rag');

-- 4. Success Message
SELECT '✅ Database cleanup successful (Traditional & LangChain versions removed).' as status;
