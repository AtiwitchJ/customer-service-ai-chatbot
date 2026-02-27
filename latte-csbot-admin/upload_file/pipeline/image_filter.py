"""
Image Filter Module
===================
Filter images based on quality criteria / 
กรองรูปภาพตามเกณฑ์คุณภาพ
"""

import io
from PIL import Image
from typing import Tuple


# Constants for image filtering / ค่าคงที่สำหรับการกรองรูปภาพ
DEFAULT_MIN_WIDTH = 120
DEFAULT_MIN_HEIGHT = 120
DEFAULT_MIN_FILESIZE_KB = 5.0
DEFAULT_MAX_ASPECT_RATIO = 8.0


def should_keep_image(
    image_bytes: bytes, 
    min_width: int = DEFAULT_MIN_WIDTH, 
    min_height: int = DEFAULT_MIN_HEIGHT, 
    min_filesize_kb: float = DEFAULT_MIN_FILESIZE_KB,
    max_aspect_ratio: float = DEFAULT_MAX_ASPECT_RATIO
) -> Tuple[bool, str]:
    """
    Check if image should be kept / ตรวจสอบว่าควรเก็บรูปภาพนี้ไว้หรือไม่
    
    Args:
        image_bytes: Raw image bytes / ข้อมูลรูปภาพดิบ
        min_width: Minimum width in pixels / ความกว้างขั้นต่ำ
        min_height: Minimum height in pixels / ความสูงขั้นต่ำ
        min_filesize_kb: Minimum file size in KB / ขนาดไฟล์ขั้นต่ำ
        max_aspect_ratio: Maximum aspect ratio / อัตราส่วนสูงสุด
        
    Returns:
        Tuple of (should_keep: bool, reason: str) / ผลลัพธ์ (ควรเก็บหรือไม่, เหตุผล)
    """
    # 1. Check file size / ตรวจสอบขนาดไฟล์
    filesize_kb = len(image_bytes) / 1024
    if filesize_kb < min_filesize_kb:
        return False, f"File too small ({filesize_kb:.1f}KB)"

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
            
            # 2. Check dimensions / ตรวจสอบ Dimension
            if width < min_width and height < min_height:
                return False, f"Dimensions too small ({width}x{height})"
            
            # 3. Check aspect ratio (prevent long lines or decorative bars)
            # ตรวจสอบ Aspect Ratio (ป้องกันเส้นยาวๆ หรือแถบตกแต่ง)
            aspect_ratio = max(width, height) / max(min(width, height), 1)
            if aspect_ratio > max_aspect_ratio:
                return False, f"Extreme aspect ratio ({aspect_ratio:.1f})"
            
            # 4. (Optional) Check color complexity or entropy
            # ถ้าเป็นสีพื้นๆ ทั้งแผ่น อาจจะไม่ใช่รูปที่มีเนื้อหา
            
            return True, "Passed criteria"
            
    except Exception as e:
        return False, f"Error processing image: {str(e)}"
