"""
Step C: Embedding Generator using Ollama (LlamaIndex)
======================================================
Creates vector embeddings using qwen3-embedding:0.6b with LlamaIndex / 
ใช้ qwen3-embedding:0.6b สำหรับสร้าง Vector embeddings โดยใช้ LlamaIndex

Includes Response Synthesizer for merging contexts / 
และ Response Synthesizer สำหรับรวม context
"""

import os
import time
import asyncio
from datetime import datetime
from typing import List, Optional

# LlamaIndex Imports
from llama_index.embeddings.ollama import OllamaEmbedding

# Configuration from environment / ดึงการตั้งค่าจาก environment variables
# Default to 'http://latta-ollama:11434' for internal Docker communication
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://latta-ollama:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b")
EMBEDDING_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT_MS", 60000)) / 1000

# Global Embedding Model Instance / สร้าง Instance ของ OllamaEmbedding
print(f"[{datetime.now().isoformat()}] [Embedder] Initializing LlamaIndex OllamaEmbedding with model={OLLAMA_EMBED_MODEL}...")
embed_model = OllamaEmbedding(
    model_name=OLLAMA_EMBED_MODEL,
    base_url=OLLAMA_BASE_URL,
    ollama_additional_kwargs={"mirostat": 0},
    request_timeout=EMBEDDING_TIMEOUT
)


async def get_embeddings_batch(
    texts: List[str],
    concurrency: int = 4
) -> List[Optional[List[float]]]:
    """
    Create embeddings for multiple texts concurrently / สร้าง embeddings หลายตัวพร้อมกัน
    """
    start_batch = time.time()
    
    try:
        # LlamaIndex has batch embedding method / LlamaIndex มี method สำหรับ batch embedding
        # Note: concurrency parameter might not be directly used by LlamaIndex's ollama implementation
        embeddings = await embed_model.aget_text_embedding_batch(texts)
        
        duration = time.time() - start_batch
        print(f"[{datetime.now().isoformat()}] [Embedder] Batch processed {len(texts)} texts in {duration:.2f}s")
        return embeddings
    except Exception as e:
        print(f"❌ Batch embedding error: {e}")
        return [None] * len(texts)


async def get_embedding(text: str) -> Optional[List[float]]:
    """
    Create embedding from text (async) / สร้าง embedding จากข้อความ (async)
    
    Args:
        text: Text to embed / ข้อความที่ต้องการ embed
        
    Returns:
        List of floats or None
    """
    if not text or not text.strip():
        return None
    try:
        return await embed_model.aget_text_embedding(text.strip())
    except Exception as e:
        print(f"❌ Embedding error: {e}")
        return None


def get_embedding_sync(text: str) -> Optional[List[float]]:
    """
    Synchronous version of get_embedding / Synchronous version ของ get_embedding
    
    Args:
        text: Text to embed / ข้อความที่ต้องการ embed
        
    Returns:
        List of floats or None
    """
    if not text or not text.strip():
        return None
    try:
        return embed_model.get_text_embedding(text.strip())
    except Exception as e:
        print(f"❌ Embedding error: {e}")
        return None


async def create_unified_document_embedding(
    full_text: str,
    max_length: int = 2000
) -> Optional[List[float]]:
    """
    Create embedding for entire document / สร้าง embedding สำหรับเอกสารรวมทั้งหมด
    
    If text is too long, uses representative sampling (start + middle + end) /
    ถ้าข้อความยาวเกินไป จะใช้วิธี representative sampling
    
    Args:
        full_text: Full document text / ข้อความรวมทั้งหมด
        max_length: Maximum length to embed entirely / ความยาวสูงสุดที่จะ embed ทั้งหมด
        
    Returns:
        Unified embedding vector
    """
    if not full_text or not full_text.strip():
        return None
    
    text = full_text.strip()
    
    # If text is short enough, embed entirely / ถ้าข้อความสั้นพอ ให้ embed ทั้งหมด
    if len(text) <= max_length:
        return await get_embedding(text)
    
    # If text is too long, use representative sampling / ถ้าข้อความยาวเกินไป ใช้วิธี representative sampling
    chunk_size = max_length // 3
    
    start_text = text[:chunk_size]
    middle_start = len(text) // 2 - chunk_size // 2
    middle_text = text[middle_start:middle_start + chunk_size]
    end_text = text[-chunk_size:]
    
    representative_text = f"{start_text}\n\n[...เนื้อหาตรงกลาง...]\n\n{middle_text}\n\n[...เนื้อหาท้าย...]\n\n{end_text}"
    
    print(f"[{datetime.now().isoformat()}] [Embedder] Creating representative embedding from {len(text)} chars -> {len(representative_text)} chars")
    return await get_embedding(representative_text)


async def create_combined_embedding(
    text_content: str,
    image_description: str = "",
    ocr_text: str = ""
) -> Optional[List[float]]:
    """
    Create embedding from combined text, description and OCR / 
    สร้าง embedding จากการรวม text, description และ OCR
    
    Args:
        text_content: Main text content / เนื้อหา text หลัก
        image_description: Image description (optional) / คำอธิบายรูปภาพ
        ocr_text: OCR text (optional) / ข้อความ OCR
        
    Returns:
        Combined embedding vector
    """
    parts = [text_content]
    
    if image_description:
        parts.append(f"[รูปภาพ: {image_description}]")
    
    if ocr_text:
        parts.append(f"[ข้อความในรูป: {ocr_text}]")
    
    combined_text = " ".join(filter(None, parts))
    
    return await get_embedding(combined_text)

