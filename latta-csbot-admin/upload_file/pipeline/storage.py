"""
Step D: Supabase Storage (pgvector)
====================================
Store documents to Supabase with vector embeddings / 
บันทึก documents ลง Supabase พร้อม vector embeddings
"""

import os
import uuid
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import time
from datetime import datetime
from supabase import create_client, Client


# Configuration from environment / ดึงการตั้งค่าจาก environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/") + "/" if os.getenv("SUPABASE_URL") else None
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


@dataclass
class DocumentRecord:
    """Record to be stored in documents table / Record ที่จะบันทึกลง documents table"""
    content: str                                   # Content / เนื้อหา
    embedding: List[float]                         # Vector embedding
    metadata: Dict[str, Any]                       # Metadata
    file_id: Optional[str] = None                  # FK to public.files
    
    def to_dict(self) -> dict:
        """Convert to dictionary for Supabase / แปลงเป็น dictionary สำหรับ Supabase"""
        data = {
            "id": str(uuid.uuid4()),
            "content": self.content,
            "embedding": self.embedding,
            "metadata": self.metadata
        }
        if self.file_id:
            data["file_id"] = self.file_id
        return data


def get_supabase_client() -> Client:
    """Create Supabase client / สร้าง Supabase client"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing Supabase configuration. "
            "Please ensure SUPABASE_URL and SUPABASE_KEY environment variables are set. "
            f"Current SUPABASE_URL: {SUPABASE_URL}, SUPABASE_KEY: {'set' if SUPABASE_KEY else 'not set'}"
        )
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Force trailing slash on storage_url to suppress library warning
    if not str(client.storage_url).endswith("/"):
        client.storage_url = client.storage_url.with_path(client.storage_url.path + "/")
    return client


async def store_file_record(
    filename: str,
    file_path: str,
    file_size: int,
    mime_type: str,
    id_override: Optional[str] = None,
    full_text: Optional[str] = None
) -> Optional[str]:
    """
    Create record in files table / สร้าง record ในตาราง files
    """
    supabase = get_supabase_client()
    try:
        record = {
            "file_name": filename,
            "file_path": file_path,
            "file_size": file_size,
            "mime_type": mime_type,
            "status": "processing",  # Default status / สถานะเริ่มต้น
            "created_at": datetime.now().isoformat()
        }
        
        if id_override:
            record["id"] = id_override
            
        if full_text:
            record["full_text"] = full_text
            
        result = supabase.table("files").insert(record).execute()
        if result.data:
            file_id = result.data[0]["id"]
            print(f"✅ Created file record: {file_id}")
            return file_id
    except Exception as e:
        print(f"❌ Failed to create file record: {e}")
        return None
    return None


async def store_document_metadata(
    document_id: str,
    file_id: str,
    filename: str,
    status: str = "processing",
    content: str = "",
    metadata: Dict[str, Any] = {}
) -> bool:
    """
    Create record in documents table (Metadata Node) / 
    สร้าง record ในตาราง documents (Metadata Node)
    
    Normalized: Removed redundant file_name, file_type, file_size, file_path
    """
    supabase = get_supabase_client()
    try:
        record = {
            "id": document_id,
            "file_id": file_id,
            "title": filename,
            "status": status,
            "content": content,
            "metadata": metadata,
            "updated_at": datetime.now().isoformat()
        }
        supabase.table("documents").insert(record).execute()
        print(f"✅ Created document metadata: {document_id}")
        return True
    except Exception as e:
        print(f"❌ Failed to create document metadata: {e}")
        return False


async def store_document_chunk(
    content: str,
    embedding: List[float],
    metadata: Dict[str, Any],
    document_id: str
) -> Optional[str]:
    """
    Store chunk to document_chunks / บันทึก chunk ลง document_chunks
    
    Normalized: Linked to document_id only
    """
    supabase = get_supabase_client()
    
    chunk_id = str(uuid.uuid4())
    record = {
        "id": chunk_id,
        "document_id": document_id,
        "content": content,
        "embedding": embedding,
        "metadata": metadata,
        "chunk_index": metadata.get("page", 0)  # Fallback if not specified
    }
    
    try:
        result = supabase.table("document_chunks").insert(record).execute()
        print(f"✅ Stored chunk: {chunk_id}")
        return chunk_id
    except Exception as e:
        print(f"❌ Store error: {e}")
        return None


async def store_documents_batch(records: List[dict]) -> List[str]:
    """
    Store multiple chunks to document_chunks (Bulk Insert) / 
    บันทึกหลาย chunks พร้อมกันลง document_chunks
    """
    supabase = get_supabase_client()
    stored_ids = []
    
    if not records:
        return []

    try:
        # Batch insert into document_chunks
        result = supabase.table("document_chunks").insert(records).execute()
        stored_ids = [rec["id"] for rec in result.data] if result.data else []
        print(f"✅ Stored {len(stored_ids)} document chunks in batch")
    except Exception as e:
        print(f"❌ Batch store error: {e}")
        # Fallback: insert one by one / ถ้าไม่สำเร็จ บันทึกทีละรายการ
        for rec in records:
            try:
                supabase.table("document_chunks").insert(rec).execute()
                stored_ids.append(rec["id"])
            except Exception as inner_e:
                print(f"  ❌ Failed to store chunk: {inner_e}")
    
    return stored_ids


async def delete_document_by_source(source_filename: str) -> int:
    """
    Delete document and related RAG data / ลบเอกสารและข้อมูล RAG ที่เกี่ยวข้อง
    """
    supabase = get_supabase_client()
    try:
        # 1. Find the file record first / หา record ไฟล์ก่อน
        file_res = supabase.table("files").select("id").eq("file_name", source_filename).execute()
        if not file_res.data:
            print(f"⚠️ No file found with name: {source_filename}")
            return 0
        
        file_id = file_res.data[0]["id"]

        # 2. Delete from files table (Cascade handles documents and chunks)
        # ลบจากตาราง files (Cascade จะจัดการ documents และ chunks)
        result = supabase.table("files").delete().eq("id", file_id).execute()
        count = len(result.data) if result.data else 0
        
        print(f"🗑️ Deleted all associated RAG data for: {source_filename} (file_id: {file_id})")
        return count
    except Exception as e:
        print(f"❌ Delete error: {e}")
        return 0


async def batch_store_unified_chunks(
    document_id: str,
    file_id: str,
    filename: str,
    chunks: List[dict],
    full_text: str = ""
) -> List[Optional[str]]:
    """
    Store multiple Unified Chunks at once (metadata and chunks) / 
    บันทึกหลาย Unified Chunks พร้อมกัน
    
    Normalized: No redundant file fields, metadata mapped correctly.
    """
    # 1. Ensure Metadata Record exists / สร้าง Metadata Record
    await store_document_metadata(
        document_id=document_id,
        file_id=file_id,
        filename=filename,
        content=full_text
    )
    
    start_store = time.time()
    print(f"[{datetime.now().isoformat()}] [Storage] Storing {len(chunks)} chunks for {filename}...")

    # 2. Prepare records for bulk insert / เตรียม records สำหรับ bulk insert
    record_dicts = []
    
    for chunk in chunks:
        # Check if this is a unified document record / ตรวจสอบว่าเป็น unified document record
        is_unified = chunk.get("is_unified_document", False)
        
        metadata = {
            "type": "unified_doc" if is_unified else "chunk",
            "page": chunk["page_number"],
            "image_urls": chunk.get("image_urls", []),
            "has_images": len(chunk.get("image_urls", [])) > 0,
            "prev_chunk_id": chunk.get("prev_chunk_id"),
            "next_chunk_id": chunk.get("next_chunk_id")
        }
        
        record_dicts.append({
            "id": str(uuid.uuid4()),
            "document_id": document_id,
            "chunk_index": chunk["page_number"],
            "content": chunk["merged_text"],
            "embedding": chunk["embedding"],
            "metadata": metadata,
            "created_at": datetime.now().isoformat()
        })
        
    result_ids = await store_documents_batch(record_dicts)
    duration = time.time() - start_store
    print(f"[{datetime.now().isoformat()}] [Storage] Finished storing {len(result_ids)} chunks. Time: {duration:.2f}s")
    return result_ids


async def update_file_status(
    file_id: str,
    status: str,
    error_message: Optional[str] = None
) -> bool:
    """
    Update status of a file record / อัปเดตสถานะของไฟล์
    """
    supabase = get_supabase_client()
    try:
        update_data = {
            "status": status,
            "updated_at": datetime.now().isoformat()
        }
        if error_message:
            update_data["error_message"] = error_message
            
        result = supabase.table("files").update(update_data).eq("id", file_id).execute()
        
        if result.data:
            return True
            
    except Exception as e:
        print(f"❌ Failed to update file status: {e}")
        return False
    return False
