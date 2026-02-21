"""
Ingestion Service
=================
Core business logic for processing PDF files.
Handles OCR, text embedding, and storing chunks into the database.

หน้าที่หลัก: ตรรกะการทำงานหลักสำหรับการประมวลผลไฟล์ PDF
จัดการเรื่อง OCR, การทำ Embedding ข้อความ, และบันทึกข้อมูลย่อยลงฐานข้อมูล
"""

import os
import uuid
import asyncio
from typing import List, Optional
from datetime import datetime
import time

from pipeline.extractor import extract_pages_from_bytes, PageContent
from pipeline.vision_analyzer import ocr_full_page
from pipeline.embedder import get_embeddings_batch, create_unified_document_embedding
from pipeline.text_splitter import split_text_recursive
from pipeline.storage import update_file_status, batch_store_unified_chunks
from pipeline.context_stitcher import create_unified_chunk

# Configuration from environment / ดึงการตั้งค่าจาก environment variables
OCR_CONCURRENCY = int(os.getenv("OCR_CONCURRENCY", 2))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 1024))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 200))


async def process_pdf_dual_extraction(
    pdf_bytes: bytes,
    filename: str,
    document_id: str,
    file_id: Optional[str] = None
) -> dict:
    """
    Dual-Extraction Pipeline (Native Text + OCR):
    1. Extract all pages
    2. Process Text & OCR in parallel
    3. Aggregate & Sort chunks
    4. Prepare for storage

    กระบวนการทำงานแบบคู่:
    1. ดึงข้อมูลทุกหน้า
    2. ประมวลผลข้อความปกติและ OCR พร้อมกัน
    3. รวมและเรียงลำดับข้อมูล
    4. เตรียมบันทึก
    """
    start_time = time.time()
    results = {
        "document_id": document_id,
        "filename": filename,
        "pages_processed": 0,
        "chunks_stored": 0,
        "images_uploaded": 0,
        "errors": [],
        "pipeline": "dual-graph-rag"
    }
    
    try:
        # Step 1: Extract pages / ขั้นตอนที่ 1: ดึงข้อมูลหน้า
        print(f"[{datetime.now().isoformat()}] 📄 [Ingestion:extract_pages] Extracting pages from {filename}...")
        start_extract = time.time()
        
        if file_id:
            await update_file_status(file_id, "extracting")
            
        pages = extract_pages_from_bytes(pdf_bytes, filename, render_pages=True)
        extract_time = time.time() - start_extract
        results["pages_processed"] = len(pages)
        print(f"[{datetime.now().isoformat()}] [Ingestion:extract_pages] Extracted {len(pages)} pages in {extract_time:.2f}s")
        
        pending_chunks: List[dict] = []  # Store extracted text / เก็บข้อมูลข้อความที่ดึงมา
        all_images: List[dict] = []      # Store images / เก็บรูปภาพ
        
        semaphore = asyncio.Semaphore(OCR_CONCURRENCY)
        
        # Parallel Page Processing / การประมวลผลแต่ละหน้าแบบขนาน
        async def process_page_extraction(page: PageContent):
            page_start = time.time()
            print(f"[{datetime.now().isoformat()}] [Ingestion:page_worker] Start Page {page.page_number}")
            page_chunks: List[dict] = []
            page_images: List[dict] = []
            
            async with semaphore:
                try:
                    # Strategy: Stitch full page texts, then split and embed
                    # กลยุทธ์: รวมข้อความทั้งหน้า แล้วแบ่งและ embed
                    
                    native_full_text = page.get_native_text()
                    ocr_full_text = ""
                    if page.full_page_image:
                         ocr_full_text = await ocr_full_page(page.full_page_image, page.page_number)
                    
                    # Use context stitcher to merge and fix newlines
                    # ใช้ context stitcher รวมและแก้ไขการขึ้นบรรทัด
                    unified_chunk_obj = await create_unified_chunk(
                        page_number=page.page_number,
                        position_in_page=0,
                        native_text=native_full_text,
                        ocr_text=ocr_full_text,
                        image_urls=[],
                        source_filename=filename
                    )
                    
                    final_text = unified_chunk_obj.merged_text
                    
                    # Split the stitched text / แบ่งข้อความที่รวมแล้ว
                    if final_text:
                        chunk_list = split_text_recursive(final_text, CHUNK_SIZE, CHUNK_OVERLAP)
                        
                        # Use Batch Embedding for better performance
                        # ใช้ Batch Embedding เพื่อประสิทธิภาพ
                        embeddings = await get_embeddings_batch(chunk_list)
                        
                        for i, txt in enumerate(chunk_list):
                            embedding = embeddings[i]
                            if embedding:
                                page_chunks.append({
                                    "page": page.page_number,
                                    "pos": i,
                                    "text": txt,
                                    "embedding": embedding,
                                    "source": "unified",
                                    "image_urls": []
                                })

                except Exception as e:
                    print(f"❌ Page {page.page_number} extraction error: {e}")
                    results["errors"].append(f"Page {page.page_number}: {e}")
                    
            page_duration = time.time() - page_start
            print(f"[{datetime.now().isoformat()}] [Ingestion:page_worker] Finished Page {page.page_number} ({page_duration:.2f}s)")
            return page_chunks, page_images

        # Execute Parallel Extraction / เริ่มการดึงข้อมูลพร้อมกัน
        extraction_results = await asyncio.gather(*[process_page_extraction(p) for p in pages])
        
        # Flatten results / รวมผลลัพธ์
        for chunks, images in extraction_results:
            pending_chunks.extend(chunks)
            all_images.extend(images)
            
        results["images_uploaded"] = len(all_images)
        
        # Step 2: Sorting / ขั้นตอนที่ 2: เรียงลำดับตามหน้าและตำแหน่ง
        pending_chunks.sort(key=lambda x: (x["page"], x["pos"]))
        
        # Aggregate Full Text / รวมข้อความทั้งหมดเพื่อแสดงผล
        print(f"[{datetime.now().isoformat()}] [Ingestion:aggregate] Sorting and aggregating text...")
        full_text_list = []
        seen_text = set()
        
        for chunk in pending_chunks:
            txt = chunk["text"].strip()
            if txt and txt not in seen_text:
                full_text_list.append(txt)
                seen_text.add(txt)
                
        unified_full_text = "\n\n".join(full_text_list)
        results["full_text_length"] = len(unified_full_text)
        results["full_text"] = unified_full_text

        # Step 3: Create Unified Document Embedding / ขั้นตอนที่ 3: สร้าง Embedding จากเอกสารรวม
        print(f"🧠 Creating unified document embedding...")
        if file_id:
            await update_file_status(file_id, "creating_unified_embedding")
            
        unified_embedding = None
        if unified_full_text.strip():
            unified_embedding = await create_unified_document_embedding(unified_full_text)
                
        if unified_embedding:
            print(f"✅ Created unified embedding (dim={len(unified_embedding)})")
            results["unified_embedding"] = unified_embedding
            results["has_unified_embedding"] = True
        else:
            print(f"⚠️ Failed to create unified embedding")
            results["has_unified_embedding"] = False

        # Step 4: Image Association / ขั้นตอนที่ 4: จับคู่รูปภาพกับข้อความที่ใกล้ที่สุด
        for image_info in all_images:
            p_num = image_info["page"]
            p_pos = image_info["pos"]
            p_url = image_info["url"]
            
            candidates = [c for c in pending_chunks if c["page"] == p_num]
            
            if candidates:
                closest = min(candidates, key=lambda c: abs(c["pos"] - p_pos))
                if "image_urls" not in closest:
                    closest["image_urls"] = []
                closest["image_urls"].append(p_url)

        print(f"🧩 Collected {len(pending_chunks)} chunks / รวบรวมได้ {len(pending_chunks)} ชิ้นส่วน")
        
        if file_id:
             await update_file_status(file_id, "embedding")
        
        # Step 5: Prepare final records / ขั้นตอนที่ 5: เตรียมข้อมูลสำหรับบันทึก
        # Generate IDs
        for chunk in pending_chunks:
            chunk["id"] = str(uuid.uuid4())
            
        processed_chunks = []
        for i, chunk in enumerate(pending_chunks):
            # LinkedList Logic (Previous/Next ID) / ตรรกะ LinkedList (ID ก่อน/ถัดไป)
            prev_id = pending_chunks[i-1]["id"] if i > 0 else None
            next_id = pending_chunks[i+1]["id"] if i < len(pending_chunks) - 1 else None
            
            record = {
                "merged_text": chunk.get("text", ""),
                "embedding": chunk.get("embedding", []),
                "page_number": chunk["page"],
                "position_in_page": chunk["pos"],
                "source_filename": filename,
                "image_urls": chunk.get("image_urls", []),
                "document_id": document_id,
                "file_id": file_id,
                "native_text": chunk.get("text", "") if chunk.get("source") == "native" else "",
                "ocr_text": chunk.get("text", "") if chunk.get("source") == "ocr" else "",
                "prev_chunk_id": prev_id,
                "next_chunk_id": next_id,
                "custom_chunk_id": chunk["id"]
            }
            processed_chunks.append(record)

        # Add unified document record if we have unified embedding
        # เพิ่ม unified document record ถ้ามี unified embedding
        if results.get("has_unified_embedding") and results.get("unified_embedding"):
            unified_record = {
                "merged_text": unified_full_text,
                "embedding": results["unified_embedding"],
                "page_number": 0,  # Special page number for unified document
                "position_in_page": 0,
                "source_filename": filename,
                "image_urls": [],
                "document_id": document_id,
                "file_id": file_id,
                "native_text": "",
                "ocr_text": "",
                "prev_chunk_id": None,
                "next_chunk_id": None,
                "custom_chunk_id": str(uuid.uuid4()),
                "is_unified_document": True  # Flag to identify unified document
            }
            processed_chunks.append(unified_record)
            print(f"📄 Added unified document record")
            
        results["processed_chunks"] = processed_chunks
        results["chunks_count"] = len(processed_chunks)
        
        total_time = time.time() - start_time
        print(f"[{datetime.now().isoformat()}] ✅ [Ingestion:DualExtraction] Complete: {len(processed_chunks)} chunks. Time: {total_time:.2f}s")
        
    except Exception as e:
        print(f"❌ Processing error: {e}")
        results["errors"].append(str(e))
    
    return results


async def process_and_update_status(
    pdf_bytes: bytes,
    filename: str,
    document_id: str,
    file_id: str
):
    """
    Background Task Entry Point / ฟังก์ชันหลักสำหรับงานเบื้องหลัง
    
    Process -> Store -> Update Status
    ประมวลผล -> บันทึก -> อัปเดตสถานะ
    """
    print(f"🔄 [Background] Starting processing for {filename} ({file_id})")
    try:
        # 1. Process / ประมวลผล
        result = await process_pdf_dual_extraction(pdf_bytes, filename, document_id, file_id=file_id)
        
        if len(result.get("errors", [])) > 0:
            error_msg = "; ".join(result["errors"])
            await update_file_status(file_id, "error", error_msg)
            print(f"❌ [Background] Processing failed: {error_msg}")
            return

        # 2. Store Chunks / บันทึกข้อมูล
        processed_chunks = result.get("processed_chunks", [])
        if processed_chunks:
            print(f"💾 [Background] Storing {len(processed_chunks)} chunks...")
            await batch_store_unified_chunks(
                document_id=document_id,
                file_id=file_id,
                filename=filename,
                chunks=processed_chunks,
                full_text=result.get("full_text", "")
            )
            
        # 3. Update Status to Done / อัปเดตสถานะเป็นเสร็จสิ้น
        await update_file_status(file_id, "done")
        print(f"✅ [Background] Completed {filename}")
        
    except Exception as e:
        print(f"❌ [Background] Critical error for {filename}: {e}")
        await update_file_status(file_id, "error", str(e))
