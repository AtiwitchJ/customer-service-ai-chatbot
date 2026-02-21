"""
Step A.5: Text Splitter using LlamaIndex
=========================================
Split long text into small chunks using LlamaIndex SentenceSplitter / 
แบ่งข้อความยาวๆ ให้เป็นชิ้นเล็กๆ โดยใช้ LlamaIndex SentenceSplitter
"""

from typing import List, Optional
from llama_index.core.node_parser import SentenceSplitter


# Constants for default values / ค่าคงที่สำหรับค่าเริ่มต้น
DEFAULT_CHUNK_SIZE = 1024
DEFAULT_CHUNK_OVERLAP = 200


def create_splitter(chunk_size: int = DEFAULT_CHUNK_SIZE, chunk_overlap: int = DEFAULT_CHUNK_OVERLAP) -> SentenceSplitter:
    """
    Create SentenceSplitter instance / สร้าง SentenceSplitter instance
    
    Args:
        chunk_size: Maximum chunk size in characters / ขนาดสูงสุดของแต่ละ chunk
        chunk_overlap: Overlapping characters between chunks / จำนวนตัวอักษรที่ทับซ้อน
        
    Returns:
        SentenceSplitter instance
    """
    return SentenceSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        paragraph_separator="\n\n",
        chunking_tokenizer_fn=None,  # Use default tokenizer / ใช้ default tokenizer
        secondary_chunking_regex="[^,.;。？！]+[,.;。？！]?"
    )


def split_text_recursive(text: str, chunk_size: int = 500, chunk_overlap: int = 200) -> List[str]:
    """
    Split text into chunks using LlamaIndex SentenceSplitter / 
    แบ่งข้อความเป็น chunks โดยใช้ LlamaIndex SentenceSplitter
    
    Args:
        text: Text to split / ข้อความที่ต้องการแบ่ง
        chunk_size: Maximum chunk size / ขนาดสูงสุดของแต่ละ chunk
        chunk_overlap: Overlapping characters / จำนวนตัวอักษรที่ทับซ้อน
        
    Returns:
        List of text chunks / List ของ chunks
    """
    if not text or not text.strip():
        return []
    
    splitter = create_splitter(chunk_size, chunk_overlap)
    
    # Use split_text directly / ใช้ split_text โดยตรง
    chunks = splitter.split_text(text.strip())
    
    # Filter only chunks with content / กรองเอาเฉพาะ chunks ที่มีเนื้อหา
    return [chunk for chunk in chunks if chunk.strip()]


def split_text_with_metadata(
    text: str, 
    chunk_size: int = DEFAULT_CHUNK_SIZE, 
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    metadata: Optional[dict] = None
) -> List[dict]:
    """
    Split text into chunks with metadata / แบ่งข้อความเป็น chunks พร้อม metadata
    
    Args:
        text: Text to split / ข้อความที่ต้องการแบ่ง
        chunk_size: Maximum chunk size / ขนาดสูงสุดของแต่ละ chunk
        chunk_overlap: Overlapping characters / จำนวนตัวอักษรที่ทับซ้อน
        metadata: Metadata to attach to each chunk / metadata ที่ต้องการแนบ
        
    Returns:
        List of dict with text and metadata / List ของ dict ที่มี text และ metadata
    """
    if not text or not text.strip():
        return []
    
    metadata = metadata or {}
    splitter = create_splitter(chunk_size, chunk_overlap)
    
    # Use split_text directly / ใช้ split_text โดยตรง
    chunks = splitter.split_text(text.strip())
    
    # Extract text and metadata from each chunk / ดึง text และ metadata
    result = []
    for i, chunk in enumerate(chunks):
        if chunk.strip():
            chunk_data = {
                "text": chunk,
                "index": i,
                "metadata": metadata
            }
            result.append(chunk_data)
    
    return result


# Backward compatibility - Keep TextSplitter class for direct usage
# รองรับ backward compatibility - เก็บ TextSplitter class ไว้
class TextSplitter:
    """
    Legacy TextSplitter - Uses SentenceSplitter internally / 
    Legacy TextSplitter - ใช้ SentenceSplitter ภายใน
    """
    def __init__(self, chunk_size: int, chunk_overlap: int):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self._splitter = create_splitter(chunk_size, chunk_overlap)
    
    def split_text(self, text: str) -> List[str]:
        """Split text into chunks / แบ่งข้อความเป็น chunks"""
        return split_text_recursive(text, self.chunk_size, self.chunk_overlap)
