"""
Step B: Vision Analyzer using Ollama
=====================================
Use OCR-LLM for Vision analysis and OCR / 
ใช้ OCR-LLM สำหรับ Vision analysis และ OCR

Upload images to Supabase Storage and get Public URL / 
อัพโหลดรูปไป Supabase Storage และรับ Public URL
"""

import os
import base64
import httpx
import asyncio
from typing import List
from dataclasses import dataclass
from datetime import datetime
import time
from supabase import create_client, Client
from llama_index.llms.ollama import Ollama


# Configuration from environment / ดึงการตั้งค่าจาก environment variables
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/") + "/"  
SUPABASE_PUBLIC_URL = os.getenv("SUPABASE_PUBLIC_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
IMAGE_BUCKET = os.getenv("IMAGE_RAG_BUCKET")


@dataclass
class ImageAnalysisResult:
    """Result from image analysis / ผลลัพธ์จากการวิเคราะห์รูปภาพ"""
    description: str       # Description from Vision model / คำอธิบายจาก Vision model
    ocr_text: str          # OCR text / ข้อความที่ OCR ได้
    public_url: str        # Public URL in Supabase Storage / URL ของรูปใน Supabase
    storage_path: str      # Path in Storage / Path ใน Storage


def get_supabase_client() -> Client:
    """Create Supabase client / สร้าง Supabase client"""
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    if not str(client.storage_url).endswith("/"):
        client.storage_url = client.storage_url.with_path(client.storage_url.path + "/")
    return client


def _get_llm():
    """Create Ollama LLM instance for Vision OCR / สร้าง Ollama LLM instance สำหรับ Vision OCR"""
    return Ollama(
        model=OLLAMA_VISION_MODEL,
        base_url=OLLAMA_BASE_URL,
        request_timeout=300.0
    )


def refine_ocr_text(raw_text: str) -> str:
    """
    Use LLM to refine OCR text for coherent content / 
    ใช้ LLM ช่วยเรียบเรียงข้อความที่ได้จาก OCR
    
    Args:
        raw_text: Raw OCR text / ข้อความ OCR ดิบ
        
    Returns:
        Refined text / ข้อความที่ปรับปรุงแล้ว
    """
    if not raw_text.strip():
        return ""
    
    llm = _get_llm()
    refine_prompt = (
        "The following text is from an OCR process and might have broken sentences or incorrect line breaks. "
        "Please reconstruct the text to be coherent and readable while preserving the original meaning and all facts. "
        "Fix broken words and merge sentences that were split across lines. "
        "Maintain Thai and English text properly. "
        f"\n\nRaw OCR Text:\n{raw_text}"
    )
    
    try:
        refined_response = llm.complete(refine_prompt)
        return str(refined_response)
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] [Vision:refine] Error refining text: {e}")
        return raw_text


def gemma_vision_processor(image_bytes: bytes, image_ext: str = "png"):
    """
    Use Gemma 3 for structure-aware OCR on images / 
    ใช้ Gemma 3 ทำ OCR บนรูปภาพ โดยเน้นการรักษาโครงสร้าง
    
    Args:
        image_bytes: Image bytes / ข้อมูลรูปภาพ
        image_ext: Image extension / นามสกุลไฟล์
        
    Returns:
        Refined OCR text / ข้อความ OCR ที่ปรับปรุงแล้ว
    """
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    llm = _get_llm()
    
    prompt = (
        "Analyze this document image. Extract all text in the correct reading order. "
        "If there are multiple columns, read top-to-bottom for each column. "
        "Represent tables in Markdown format. Support Thai and English. "
        "Output only the structured content."
    )
    
    try:
        print(f"[{datetime.now().isoformat()}] [Vision:gemma_vision] Starting vision OCR...")
        response = llm.complete(prompt, images=[image_base64])
        raw_text = str(response)
        
        refined_text = refine_ocr_text(raw_text)
        return refined_text
        
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] [Vision:gemma_vision] Error: {e}")
        return ""


async def analyze_image_with_ollama(
    image_bytes: bytes,
    image_ext: str,
    context: str = ""
) -> tuple[str, str]:
    """
    Analyze image with Ollama Vision model / วิเคราะห์รูปภาพด้วย Ollama Vision model
    
    Args:
        image_bytes: Image bytes / bytes ของรูปภาพ
        image_ext: File extension (png, jpg) / นามสกุลไฟล์
        context: Additional context (optional) / บริบทเพิ่มเติม
        
    Returns:
        Tuple of (description, ocr_text) / (คำอธิบาย, ข้อความ OCR)
    """
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    prompt = """คุณเป็น AI ที่เชี่ยวชาญในการวิเคราะห์รูปภาพ
กรุณาทำสิ่งต่อไปนี้:

1. **คำอธิบายภาพ**: อธิบายสิ่งที่เห็นในรูปภาพอย่างละเอียด โดยเฉพาะถ้าเป็นหน้าจอแอพหรือขั้นตอนการใช้งาน
2. **OCR**: อ่านข้อความทั้งหมดที่ปรากฏในรูปภาพ

ตอบในรูปแบบ:
DESCRIPTION: [คำอธิบายภาพ]
OCR_TEXT: [ข้อความที่อ่านได้จากรูป]"""

    if context:
        prompt += f"\n\nบริบท: {context}"
    
    try:
        start_time = time.time()
        print(f"[{datetime.now().isoformat()}] [Vision:analyze_image] Start analysis. Model: {OLLAMA_VISION_MODEL}")
        
        llm = _get_llm()
        response = llm.complete(prompt, images=[image_base64])
        output_text = str(response)
        
        duration = time.time() - start_time
        print(f"[{datetime.now().isoformat()}] [Vision:analyze_image] Completed ({duration:.2f}s)")
        
        description = ""
        ocr_text = ""
        
        if "DESCRIPTION:" in output_text:
            parts = output_text.split("DESCRIPTION:", 1)
            if len(parts) > 1:
                desc_part = parts[1]
                if "OCR_TEXT:" in desc_part:
                    description = desc_part.split("OCR_TEXT:")[0].strip()
                    ocr_text = desc_part.split("OCR_TEXT:", 1)[1].strip()
                else:
                    description = desc_part.strip()
        else:
            description = output_text.strip()
        
        return description, ocr_text
        
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] [Vision:analyze_image] Error: {e}")
        return f"Vision analysis error: {str(e)}", ""


async def upload_image_to_supabase(
    image_bytes: bytes,
    image_ext: str,
    document_id: str,
    page_number: int,
    position: int
) -> tuple[str, str]:
    """
    Upload image to Supabase Storage / อัพโหลดรูปภาพไป Supabase Storage
    
    Args:
        image_bytes: Image bytes / bytes ของรูปภาพ
        image_ext: File extension / นามสกุลไฟล์
        document_id: Document ID / ID ของเอกสาร
        page_number: Page number / เลขหน้า
        position: Position in page / ตำแหน่งในหน้า
        
    Returns:
        Tuple of (public_url, storage_path) / (URL สาธารณะ, path ใน storage)
    """
    supabase = get_supabase_client()
    
    # Create unique filename / สร้าง unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{document_id}/page{page_number}_pos{position}_{timestamp}.{image_ext}"
    
    try:
        # Upload / อัปโหลด
        result = supabase.storage.from_(IMAGE_BUCKET).upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": f"image/{image_ext}"}
        )
        
        # Get public URL / รับ public URL
        base_url = SUPABASE_PUBLIC_URL.rstrip('/')
        public_url = f"{base_url}/storage/v1/object/public/{IMAGE_BUCKET}/{filename}"
        
        print(f"✅ Uploaded image to: {public_url}")
        return public_url, filename
        
    except Exception as e:
        print(f"❌ Supabase upload error: {e}")
        raise


async def process_image_element(
    image_bytes: bytes,
    image_ext: str,
    document_id: str,
    page_number: int,
    position: int,
    context: str = ""
) -> ImageAnalysisResult:
    """
    Complete image processing: Vision + Upload / 
    Process รูปภาพแบบครบ loop: Vision + Upload
    
    Args:
        image_bytes: Image bytes / bytes ของรูปภาพ
        image_ext: File extension / นามสกุลไฟล์
        document_id: Document ID / ID ของเอกสาร
        page_number: Page number / เลขหน้า
        position: Position in page / ตำแหน่งในหน้า
        context: Additional context / บริบทเพิ่มเติม
        
    Returns:
        ImageAnalysisResult
    """
    # Run Vision analysis and Upload concurrently / ทำ Vision analysis และ Upload พร้อมกัน
    vision_task = analyze_image_with_ollama(image_bytes, image_ext, context)
    upload_task = upload_image_to_supabase(
        image_bytes, image_ext, document_id, page_number, position
    )
    
    (description, ocr_text), (public_url, storage_path) = await asyncio.gather(
        vision_task, upload_task
    )
    
    return ImageAnalysisResult(
        description=description,
        ocr_text=ocr_text,
        public_url=public_url,
        storage_path=storage_path
    )


async def batch_process_images(
    images: List[tuple],  # List of (image_bytes, image_ext, doc_id, page, pos, context)
    concurrency: int = 2
) -> List[ImageAnalysisResult]:
    """
    Process multiple images with rate limiting / Process หลายรูปพร้อมกันแบบ rate-limited
    
    Args:
        images: List of image tuples / List ของ tuples ข้อมูลรูปภาพ
        concurrency: Number of concurrent tasks / จำนวน concurrent tasks
        
    Returns:
        List of ImageAnalysisResult
    """
    semaphore = asyncio.Semaphore(concurrency)
    
    async def process_with_semaphore(img_tuple):
        async with semaphore:
            return await process_image_element(*img_tuple)
    
    tasks = [process_with_semaphore(img) for img in images]
    return await asyncio.gather(*tasks)


# ============================================================================
# Dual-Extraction Support: Full-Page Visual OCR
# Dual-Extraction Support: OCR ทั้งหน้า
# ============================================================================

FULL_PAGE_OCR_PROMPT = """คุณเป็น AI ที่เชี่ยวชาญในการอ่านข้อความจากภาพหน้าเอกสาร

กรุณาอ่านข้อความทั้งหมดที่ปรากฏในรูปภาพนี้ และจัดรูปแบบเป็น Markdown:
- **หัวข้อ**: ใช้ #, ##, ### ตามลำดับความสำคัญ
- **รายการ**: ใช้ - หรือ 1. สำหรับรายการ
- **ตาราง**: สร้างเป็น Markdown Table
- **ตัวหนา/เอียง**: ใช้ ** หรือ * ตามความเหมาะสม
- **โครงสร้าง**: รักษาการจัดวางให้อ่านง่ายเหมือนต้นฉบับ

ตอบเป็นเนื้อหา Markdown เท่านั้น ไม่ต้องเกริ่นนำหรือสรุปปิดท้าย:"""


async def ocr_full_page(page_image_bytes: bytes, page_number: int = 1) -> str:
    """
    Full-page Visual OCR for Dual-Extraction Pipeline / 
    Visual OCR ทั้งหน้าสำหรับ Dual-Extraction Pipeline
    
    Args:
        page_image_bytes: Page image bytes (PNG) / bytes ของ page image
        page_number: Page number for logging / เลขหน้า (สำหรับ logging)
        
    Returns:
        OCR text from entire page / ข้อความที่ OCR ได้ทั้งหน้า
    """
    image_base64 = base64.b64encode(page_image_bytes).decode('utf-8')
    
    max_retries = 3
    retry_delay = 5.0
    
    for attempt in range(max_retries):
        try:
            print(f"[{datetime.now().isoformat()}] [Vision:ocr_full_page] Start Page {page_number}. Attempt {attempt+1}/{max_retries}. Model: {OLLAMA_VISION_MODEL}")
            start_time = time.time()
            
            async with httpx.AsyncClient(timeout=900.0) as client:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": OLLAMA_VISION_MODEL,
                        "prompt": FULL_PAGE_OCR_PROMPT,
                        "images": [image_base64],
                        "stream": False,
                        "options": {
                            "temperature": 0.0
                        }
                    }
                )
                
                duration = time.time() - start_time
                print(f"[{datetime.now().isoformat()}] [Vision:ocr_full_page] Page {page_number} request finished ({duration:.2f}s). Status: {response.status_code}")
                
                if response.status_code == 503:
                    # Model might be loading or busy / Model อาจกำลังโหลดหรือยุ่ง
                    print(f"⚠️ Service unavailable (503) on attempt {attempt+1}. Retrying in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                    
                response.raise_for_status()
                result = response.json()
                
                ocr_text = result.get("response", "").strip()
                if ocr_text:
                    print(f"✅ Visual OCR page {page_number}: {len(ocr_text)} chars")
                return ocr_text
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 503 and attempt < max_retries - 1:
                print(f"⚠️ HTTP 503 on attempt {attempt+1}. Retrying...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
                continue
            
            error_detail = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
            print(f"[{datetime.now().isoformat()}] ❌ Full-page OCR HTTP error (page {page_number}): {error_detail}")
            return ""
            
        except httpx.TimeoutException:
            print(f"❌ Full-page OCR timeout (page {page_number})")
            return ""
        except Exception as e:
            print(f"❌ Full-page OCR error (page {page_number}): {type(e).__name__}: {e}")
            return ""
            
    return ""


async def batch_ocr_pages(page_images: List[bytes], concurrency: int = 2) -> List[str]:
    """
    OCR multiple pages concurrently / OCR หลายหน้าพร้อมกัน
    
    Args:
        page_images: List of page image bytes / List ของ page image bytes
        concurrency: Number of concurrent OCR tasks / จำนวน concurrent OCR tasks
        
    Returns:
        List of OCR text (1 per page) / List ของ OCR text (1 ต่อหน้า)
    """
    semaphore = asyncio.Semaphore(concurrency)
    
    async def ocr_with_semaphore(idx: int, img_bytes: bytes) -> str:
        async with semaphore:
            return await ocr_full_page(img_bytes, page_number=idx + 1)
    
    tasks = [ocr_with_semaphore(i, img) for i, img in enumerate(page_images)]
    return await asyncio.gather(*tasks)


# ============================================================================
# Semantic Filtering
# Semantic Filtering - กรองความหมาย
# ============================================================================

FILTER_PROMPT_EN = """
You are an expert Technical Documentation Editor.
Your task is to evaluate the provided image and decide whether it should be included in a Technical Support Manual based on its "Informational Value."

Please analyze the image using the following criteria:

### CRITERIA FOR DECISION:

**[KEEP] - High Technical Value**
1.  **Screenshots & UI Mockups:** Actual software screens or high-fidelity mockups showing menus, forms, buttons, or specific data fields (even if they are stylized/illustrated).
2.  **Process & Workflow Diagrams:** Images that illustrate a specific "Step-by-Step" action (e.g., Input -> Action -> Output), such as scanning a card to see a result.
3.  **Hardware & Error Messages:** Photos of physical devices, ports, wiring, or readable error logs/codes.
4.  **Instructional Context:** Visuals that contain specific text labels, arrows, or pointers explaining *how* to use the system.

**[DISCARD] - Low/No Technical Value**
1.  **Pure Decoration:** Generic clip art, cartoons, or vectors used solely for aesthetics (e.g., a smiling mascot, a floating cloud icon).
2.  **Stock Photos:** Generic images of people using computers, shaking hands, or meeting (unless they show a specific hardware setup).
3.  **Abstract Graphics:** Vague shapes or metaphors that do not convey specific instructions.

### INSTRUCTIONS:
- Look past the *visual style*. Even if an image looks like a cartoon/vector, if it demonstrates a **user workflow** or **UI layout**, it must be **KEPT**.
- If the image guides the user on "what to do" or "what to see," keep it.

### RESPONSE FORMAT:
Reasoning: [Briefly explain the image's function. Does it show a specific step, UI, or just a vibe?]
Decision: [KEEP or DISCARD]
"""


async def check_image_relevance(image_bytes: bytes) -> bool:
    """
    Check if image has technical relevance (Semantic Check) / 
    ตรวจสอบว่ารูปภาพมีความสำคัญทางเทคนิคหรือไม่
    
    Args:
        image_bytes: Image bytes / ข้อมูลรูปภาพ
        
    Returns:
        True if should keep, False if decorative / True ถ้าควรเก็บ, False ถ้าเป็นรูปตกแต่ง
    """
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            print(f"[{datetime.now().isoformat()}] [Vision:check_filter] Start Check.")
            start_time = time.time()
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_VISION_MODEL,
                    "prompt": FILTER_PROMPT_EN,
                    "images": [image_base64],
                    "stream": False,
                    "options": {
                        "temperature": 0.0
                    }
                }
            )
            duration = time.time() - start_time
            print(f"[{datetime.now().isoformat()}] [Vision:check_filter] Completed ({duration:.2f}s). Status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"⚠️ Semantic check failed (HTTP {response.status_code}), defaulting to KEEP.")
                return True
                
            result = response.json()
            answer = result.get("response", "").strip().upper()
            
            # Check answer format / ตรวจสอบคำตอบตาม Format
            is_relevant = "DECISION: KEEP" in answer or "KEEP" in answer.split('\n')[-1]
            print(f"🧠 Semantic Check: {answer} -> {'✅ Keep' if is_relevant else '🗑️ Discard'}")
            return is_relevant
            
    except Exception as e:
        print(f"⚠️ Semantic check error: {e}, defaulting to KEEP.")
        return True
