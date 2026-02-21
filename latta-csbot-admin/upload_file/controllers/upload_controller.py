"""
Upload Controller
=================
Handles file upload requests, validation, and initiates background processing.
จัดการคำร้องขออัปโหลดไฟล์ การตรวจสอบความถูกต้อง และเริ่มการประมวลผลเบื้องหลัง
"""

import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from pipeline.storage import (
    get_supabase_client,
    store_file_record
)
from services.ingestion_service import process_and_update_status

# Define upload directory / กำหนดโฟลเดอร์สำหรับเก็บไฟล์อัปโหลด
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed file extensions / นามสกุลไฟล์ที่อนุญาต
ALLOWED_EXTS = {
    '.pdf', '.pptx', '.ppt', '.docx', '.doc', 
    '.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.webp',
    '.odp', '.ods', '.odt', '.ttf', '.rtf', '.txt', 
    '.html', '.json', '.zip', '.xml'
}


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for Supabase Storage.
    ทำความสะอาดชื่อไฟล์สำหรับ Supabase Storage
    """
    name, ext = os.path.splitext(filename)
    name = name.replace(' ', '_')
    # Keep only ASCII alphanumerics and some symbols / เก็บเฉพาะ ASCII ตัวเลข ตัวอักษร และสัญลักษณ์บางตัว
    safe_chars = [c for c in name if c.isascii() and (c.isalnum() or c in '-_.')]
    safe_name = ''.join(safe_chars)
    
    # Fallback if name becomes empty / ใช้ UUID หากชื่อไฟล์ว่างเปล่า
    if not safe_name:
        safe_name = str(uuid.uuid4())[:8]
    
    # Add timestamp for uniqueness / เพิ่ม timestamp เพื่อไม่ให้ชื่อซ้ำ
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{timestamp}_{safe_name}{ext}"


async def upload_and_process(
    files: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Handle single file upload and start background processing.
    จัดการการอัปโหลดไฟล์เดียวและเริ่มการประมวลผลเบื้องหลัง
    """
    file = files
    ext = os.path.splitext(file.filename)[1].lower()
    
    # Validate file type / ตรวจสอบประเภทไฟล์
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Supported: {', '.join(sorted(ALLOWED_EXTS))}"
        )
    
    try:
        pdf_bytes = await file.read()
        document_id = str(uuid.uuid4())
        file_id_record = str(uuid.uuid4())
        
        # Save locally for backup/debugging / บันทึกไฟล์ลงเครื่องเพื่อสำรองหรือดีบั๊ก
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        saved_filename = f"{timestamp}_{file.filename}"
        file_path = UPLOAD_DIR / saved_filename
        with open(file_path, "wb") as f:
            f.write(pdf_bytes)
            
        try:
            # Upload to Supabase Storage / อัปโหลดขึ้น Supabase
            supabase = get_supabase_client()
            storage_path = sanitize_filename(file.filename)
            content_type = file.content_type or "application/octet-stream"
            
            supabase.storage.from_("file_rag").upload(
                path=storage_path,
                file=pdf_bytes,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            # Create Database Record / สร้างระเบียนในฐานข้อมูล
            await store_file_record(
                filename=file.filename,
                file_path=storage_path,
                file_size=len(pdf_bytes),
                mime_type=content_type,
                id_override=file_id_record
            )
            
            # Start Background Processing / เริ่มการทำงานเบื้องหลัง
            if background_tasks:
                background_tasks.add_task(
                    process_and_update_status,
                    pdf_bytes,
                    file.filename,
                    document_id,
                    file_id_record
                )
            
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "File upload started",
                    "file_id": file_id_record
                }
            )
        finally:
            # Cleanup local file / ลบไฟล์จากเครื่อง
            if file_path.exists():
                file_path.unlink()
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


async def upload_multiple(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Handle multiple file uploads.
    จัดการการอัปโหลดหลายไฟล์
    """
    results = []
    
    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTS:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": f"File type not supported. Allowed: {', '.join(sorted(ALLOWED_EXTS))}"
            })
            continue
        
        try:
            pdf_bytes = await file.read()
            document_id = str(uuid.uuid4())
            file_id_record = str(uuid.uuid4())
            
            # Upload & Create Record / อัปโหลดและสร้างระเบียน
            supabase = get_supabase_client()
            storage_path = sanitize_filename(file.filename)
            content_type = file.content_type or "application/octet-stream"
            
            supabase.storage.from_("file_rag").upload(
                path=storage_path,
                file=pdf_bytes,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            await store_file_record(
                filename=file.filename,
                file_path=storage_path,
                file_size=len(pdf_bytes),
                mime_type=content_type,
                id_override=file_id_record
            )
            
            # Add to Background Tasks / เพิ่มเข้าคิวงานเบื้องหลัง
            if background_tasks:
                background_tasks.add_task(
                    process_and_update_status,
                    pdf_bytes,
                    file.filename,
                    document_id,
                    file_id_record
                )
            
            results.append({
                "filename": file.filename,
                "success": True,
                "status": "started",
                "file_id": file_id_record
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })
    
    return {
        "success": True,
        "count": len(results),
        "results": results
    }

