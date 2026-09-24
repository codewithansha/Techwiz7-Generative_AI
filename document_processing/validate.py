from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from config.settings import get_settings

ALLOWED_KB_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
}
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv"}
ALLOWED_COMPLAINT_ATTACHMENTS = {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".txt"}


def _extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def validate_knowledge_file(upload: UploadFile, content: bytes) -> None:
    settings = get_settings()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty files are not allowed.")
    ext = _extension(upload.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_mb} MB limit.")


def validate_complaint_attachment(upload: UploadFile, content: bytes) -> None:
    if not content:
        raise HTTPException(status_code=400, detail="Empty attachment is not allowed.")
    ext = _extension(upload.filename or "")
    if ext not in ALLOWED_COMPLAINT_ATTACHMENTS:
        raise HTTPException(status_code=400, detail=f"Unsupported attachment type: {ext}")


def file_checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
