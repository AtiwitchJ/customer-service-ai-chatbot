"""
Upload File Service - Main Entry Point
======================================
FastAPI application for the RAG file upload and processing service.
แอปพลิเคชัน FastAPI สำหรับบริการอัปโหลดและประมวลผลไฟล์ RAG
"""

import warnings
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Suppress Supabase storage URL trailing slash warning
# ปิดการแจ้งเตือนเรื่อง trailing slash ของ Supabase storage URL
warnings.filterwarnings("ignore", message="Storage endpoint URL should have a trailing slash")

from routes.upload_file_Routes import router as api_router

# Load environment variables / โหลดตัวแปรสภาพแวดล้อม
load_dotenv()

# Service metadata / ข้อมูลบริการ
SERVICE_TITLE = "Ingestion Pipeline Service"
SERVICE_DESCRIPTION = "Python pipeline for PDF ingestion with Vision and Embedding"
SERVICE_VERSION = "2.1.0"

# Create FastAPI app / สร้างแอป FastAPI
app = FastAPI(
    title=SERVICE_TITLE,
    description=SERVICE_DESCRIPTION,
    version=SERVICE_VERSION
)

# CORS middleware / มิดเดิลแวร์ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Router / รวม Router
app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint - Service info / จุดเริ่มต้น - ข้อมูลบริการ"""
    return {
        "status": "online",
        "service": "Ingestion Pipeline",
        "version": SERVICE_VERSION,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/health")
async def health_check():
    """Health check endpoint / จุดตรวจสอบสถานะสุขภาพ"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    # Development server configuration / การตั้งค่าเซิร์ฟเวอร์สำหรับการพัฒนา
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
