"""
Upload File Routes
==================
Defines API endpoints for file uploading and management.
Routes requests to the Upload Controller.

กำหนด API Endpoints สำหรับการอัปโหลดและจัดการไฟล์
ส่งต่อคำขอไปยัง Upload Controller
"""

from fastapi import APIRouter, File, UploadFile, BackgroundTasks
from typing import List

from controllers.upload_controller import (
    upload_and_process,
    upload_multiple
)

# Create router / สร้าง router
router = APIRouter()

# -----------------------------------------------------------------------------
# API Endpoints / จุดเชื่อมต่อ API
# -----------------------------------------------------------------------------

@router.post("/upload", status_code=202)
async def upload_single_file(
    files: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Upload a single file and start processing.
    อัปโหลดไฟล์เดียวและเริ่มการประมวลผล
    """
    return await upload_and_process(files, background_tasks)


@router.post("/upload/multiple", status_code=202)
async def upload_multiple_files(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Upload multiple files and start processing.
    อัปโหลดหลายไฟล์พร้อมกันและเริ่มการประมวลผล
    """
    return await upload_multiple(files, background_tasks)

