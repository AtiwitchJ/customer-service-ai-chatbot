"""
Context Stitcher Module
=======================
Merges text from PyMuPDF (Native) and Visual OCR using OCR-LLM as a "sentence stitcher" / 
ใช้ OCR-LLM เป็น "ช่างเย็บประโยค" รวมข้อมูลจาก PyMuPDF (Native) และ Visual OCR เข้าด้วยกัน

Features:
- Merge: Combine text from 2 sources / รวมข้อความจาก 2 แหล่ง
- Dedupe: Remove duplicate words / ตัดคำซ้ำออก
- Repair: Fix broken sentences / ซ่อมประโยคที่ขาด
- Reorder: Reorder for natural reading / เรียงลำดับใหม่ให้อ่านเป็นธรรมชาติ
"""

import os
import time
from datetime import datetime
import asyncio
from typing import List, Optional
from dataclasses import dataclass, field
import httpx


# Configuration from environment / ดึงการตั้งค่าจาก environment variables
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL")
OLLAMA_TAGGING_MODEL = os.getenv("OLLAMA_TAGGING_MODEL", "gemma3:4b-cloud")
STITCH_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT_MS", "120000")) / 1000


@dataclass
class UnifiedChunk:
    """
    Unified chunk containing Native Text + OCR + Images / 
    ก้อนข้อมูลที่รวม Native Text + OCR + Images ไว้ด้วยกัน
    """
    page_number: int                          # Page number / เลขหน้า
    position_in_page: int                     # Position within page / ตำแหน่งในหน้า
    native_text: str = ""                     # Text from PyMuPDF / ข้อความจาก PyMuPDF
    ocr_text: str = ""                        # Text from Gemma Visual OCR / ข้อความจาก Gemma Visual OCR
    merged_text: str = ""                     # After AI Stitch / ข้อความหลัง AI Stitch
    image_urls: List[str] = field(default_factory=list)  # Image URLs / URLs ของรูปภาพ
    source_filename: str = ""                 # Source filename / ชื่อไฟล์ต้นทาง
    # Graph RAG Fields / ฟิลด์สำหรับ Graph RAG
    prev_chunk_id: Optional[str] = None       # Previous chunk ID / ID ของ chunk ก่อนหน้า
    next_chunk_id: Optional[str] = None       # Next chunk ID / ID ของ chunk ถัดไป
    
    def to_metadata(self) -> dict:
        """Generate metadata for Supabase / สร้าง metadata สำหรับ Supabase"""
        return {
            "type": "unified",
            "page": self.page_number,
            "position_in_page": self.position_in_page,
            "source": self.source_filename,
            "image_urls": self.image_urls,
            "extraction_method": "dual",
            "has_native": bool(self.native_text),
            "has_ocr": bool(self.ocr_text)
        }


# AI Prompt for text stitching / Prompt สำหรับ AI ในการรวมข้อความ
STITCH_PROMPT_TEMPLATE = """คุณเป็น AI ที่เชี่ยวชาญในการรวมข้อมูลจากหลายแหล่ง

**ข้อมูลจาก Native Text Extraction (PyMuPDF):**
{native_text}

**ข้อมูลจาก Visual OCR:**
{ocr_text}

**งานของคุณ:**
1. รวมข้อมูลทั้งสองแหล่งเข้าด้วยกัน
2. ตัดข้อความที่ซ้ำซ้อนออก (Deduplicate)
3. ซ่อมแซมประโยคที่ขาดหาย หรือไม่สมบูรณ์
4. เรียงลำดับใหม่ให้อ่านเป็นธรรมชาติ
5. **สำคัญ:** ให้จัดข้อความภาษาไทยให้ต่อเนื่องกันเป็นย่อหน้าเดียว ห้ามเว้นบรรทัดใหม่พร่ำเพรื่อ ยกเว้นเป็นการขึ้นหัวข้อใหม่จริงๆ (Join broken Thai lines into paragraphs)
6. **การตัดคำ:** ให้ลบเลขหน้าที่ลอยๆ อยู่ (เช่น 1, 2, 3) ที่ไม่ได้เป็นส่วนหนึ่งของหัวข้อหรือเนื้อหาออก

**ห้าม:** เพิ่มข้อมูลใหม่ที่ไม่มีในข้อมูลต้นฉบับ

**ตอบเป็นข้อความที่ merge แล้วเท่านั้น ไม่ต้องอธิบาย:**"""


async def stitch_texts(native_text: str, ocr_text: str) -> str:
    """
    Use AI to merge text from 2 sources (async via httpx) /
    ใช้ AI รวมข้อความจาก 2 แหล่ง (async ผ่าน httpx)
    
    Args:
        native_text: Text from PyMuPDF / ข้อความจาก PyMuPDF
        ocr_text: Text from Visual OCR / ข้อความจาก Visual OCR
        
    Returns:
        Merged text / ข้อความที่ merge แล้ว
    """
    if not native_text and not ocr_text:
        return ""
    if not native_text:
        return ocr_text.strip()
    if not ocr_text:
        return native_text.strip()
    
    if native_text.strip() == ocr_text.strip():
        return native_text.strip()
    
    prompt = STITCH_PROMPT_TEMPLATE.format(
        native_text=native_text or "(ไม่มีข้อมูล)",
        ocr_text=ocr_text or "(ไม่มีข้อมูล)"
    )
    
    print(f"[{datetime.now().isoformat()}] [Stitcher] Stitching text... Native: {len(native_text)} chars, OCR: {len(ocr_text)} chars")
    start_stitch = time.time()
    
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(STITCH_TIMEOUT)) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_TAGGING_MODEL,
                    "prompt": prompt,
                    "stream": False
                }
            )
            response.raise_for_status()
            merged = response.json().get("response", "").strip()
        
        if merged:
            duration = time.time() - start_stitch
            print(f"[{datetime.now().isoformat()}] ✅ [Stitcher] Success ({len(merged)} chars). Time: {duration:.2f}s")
            return merged
        else:
            return f"{native_text}\n{ocr_text}".strip()
            
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] [Stitcher] ⚠️ AI Stitch failed, using fallback: {e}")
        return f"{native_text}\n{ocr_text}".strip()


async def create_unified_chunk(
    page_number: int,
    position_in_page: int,
    native_text: str,
    ocr_text: str,
    image_urls: List[str],
    source_filename: str
) -> UnifiedChunk:
    """
    Create UnifiedChunk with merged text / สร้าง UnifiedChunk พร้อม merge text
    
    Args:
        page_number: Page number / เลขหน้า
        position_in_page: Position within page / ตำแหน่งในหน้า
        native_text: Text from PyMuPDF / ข้อความจาก PyMuPDF
        ocr_text: Text from Visual OCR / ข้อความจาก Visual OCR
        image_urls: Image URLs / URLs ของรูปภาพที่เกี่ยวข้อง
        source_filename: Source filename / ชื่อไฟล์ต้นทาง
        
    Returns:
        UnifiedChunk with merged text
    """
    merged_text = await stitch_texts(native_text, ocr_text)
    
    return UnifiedChunk(
        page_number=page_number,
        position_in_page=position_in_page,
        native_text=native_text,
        ocr_text=ocr_text,
        merged_text=merged_text,
        image_urls=image_urls,
        source_filename=source_filename
    )


async def batch_stitch(chunks_data: List[dict], concurrency: int = 2) -> List[UnifiedChunk]:
    """
    Stitch multiple chunks concurrently / Stitch หลาย chunks พร้อมกัน
    
    Args:
        chunks_data: List of dict with keys: page_number, position_in_page, 
                     native_text, ocr_text, image_urls, source_filename
        concurrency: Number of concurrent tasks / จำนวน concurrent tasks
        
    Returns:
        List of UnifiedChunk
    """
    semaphore = asyncio.Semaphore(concurrency)
    
    async def process_one(data: dict) -> UnifiedChunk:
        async with semaphore:
            return await create_unified_chunk(**data)
    
    tasks = [process_one(d) for d in chunks_data]
    return await asyncio.gather(*tasks)
