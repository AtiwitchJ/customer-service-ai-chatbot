"""
Pipeline Package
================
Ingestion Pipeline for PDF processing
"""

from .extractor import DocumentElement, extract_pages_from_bytes, PageContent
from .vision_analyzer import (
    ImageAnalysisResult,
    analyze_image_with_ollama,
    upload_image_to_supabase,
    process_image_element,
    batch_process_images,
    ocr_full_page # Export this too
)
from .embedder import (
    get_embedding, 
    get_embeddings_batch, 
    create_combined_embedding, 
    create_unified_document_embedding
)
from .text_splitter import split_text_recursive, split_text_with_metadata, create_splitter
from .storage import (
    DocumentRecord,
    store_document_metadata,
    store_document_chunk,
    store_documents_batch,
    delete_document_by_source,
    batch_store_unified_chunks # Export this
)

__all__ = [
    # Extractor
    "DocumentElement",
    "PageContent",
    "extract_pages_from_bytes",
    # Vision
    "ImageAnalysisResult",
    "analyze_image_with_ollama",
    "upload_image_to_supabase",
    "process_image_element",
    "batch_process_images",
    "ocr_full_page",
    # Embedder
    "get_embedding",
    "get_embeddings_batch",
    "create_combined_embedding",
    "create_unified_document_embedding",
    # Text Splitter
    "split_text_recursive",
    "split_text_with_metadata",
    "create_splitter",
    # Storage
    "DocumentRecord",
    "store_document_metadata",
    "store_document_chunk",
    "store_documents_batch",
    "delete_document_by_source",
    "batch_store_unified_chunks"
]
