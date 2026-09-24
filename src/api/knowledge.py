from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from config.settings import get_settings
from database.models import (
    DocumentCategory,
    DocumentChunk,
    DocumentStatus,
    KnowledgeDocument,
)
from database.session import get_db
from document_processing.chunking import chunk_sections
from document_processing.parser import parse_document
from document_processing.validate import file_checksum, validate_knowledge_file
from knowledge_base.impact import flag_complaints_on_policy_change
from knowledge_base.precedence import PRECEDENCE
from security.audit import write_audit
from security.auth import AdminUser, StaffUser

router = APIRouter(prefix="/api/v1/knowledge-base", tags=["knowledge-base"])


@router.post("/documents")
def upload_document(
    user: AdminUser,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    document_code: str = Form(...),
    title: str = Form(...),
    version: str = Form(...),
    category: str = Form(...),
    status: str = Form("active"),
    effective_date: str | None = Form(None),
    expiry_date: str | None = Form(None),
):
    content = file.file.read()
    validate_knowledge_file(file, content)
    checksum = file_checksum(content)
    duplicate = db.query(KnowledgeDocument).filter(KnowledgeDocument.checksum == checksum).first()
    if duplicate:
        raise HTTPException(status_code=409, detail=f"Duplicate document of {duplicate.document_code} v{duplicate.version}")
    existing_version = (
        db.query(KnowledgeDocument)
        .filter(KnowledgeDocument.document_code == document_code, KnowledgeDocument.version == version)
        .first()
    )
    if existing_version:
        raise HTTPException(status_code=409, detail="Document ID + version already exists.")
    dest_dir = get_settings().upload_path / "knowledge"
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = file.filename or f"{document_code}{Path(file.filename or '.txt').suffix}"
    dest = dest_dir / f"{document_code}_{version}_{filename}"
    dest.write_bytes(content)

    cat = DocumentCategory(category)
    doc_status = DocumentStatus(status)
    doc = KnowledgeDocument(
        document_code=document_code,
        title=title,
        version=version,
        category=cat,
        status=DocumentStatus.draft if doc_status == DocumentStatus.draft else doc_status,
        precedence_rank=PRECEDENCE.get(cat, 50),
        effective_date=date.fromisoformat(effective_date) if effective_date else date.today(),
        expiry_date=date.fromisoformat(expiry_date) if expiry_date else None,
        checksum=checksum,
        original_filename=filename,
        storage_path=str(dest),
        uploaded_by_id=user.id,
    )
    db.add(doc)
    db.flush()
    if doc.status == DocumentStatus.active:
        _supersede_previous(db, doc)
    sections = parse_document(dest, content)
    doc.content_text = "\n\n".join(section["content"] for section in sections)
    chunks = chunk_sections(sections)
    if not chunks:
        raise HTTPException(status_code=400, detail="Could not extract text from the document.")
    for chunk in chunks:
        db.add(
            DocumentChunk(
                chunk_code=f"{document_code}-v{version}-C{chunk['ordinal']:03d}",
                document_id=doc.id,
                section=chunk["section"],
                heading=chunk["heading"],
                page_number=chunk["page_number"],
                version=version,
                content=chunk["content"],
            )
        )
    affected = flag_complaints_on_policy_change(db, doc) if doc.status == DocumentStatus.active else 0
    write_audit(
        db,
        actor_id=user.id,
        entity_type="document",
        entity_id=document_code,
        action="upload",
        details={"version": version, "chunks": len(chunks), "affected_open_complaints": affected},
    )
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "document_code": doc.document_code, "chunks": len(chunks), "affected_open_complaints": affected}


@router.get("/documents")
def list_documents(user: StaffUser, db: Session = Depends(get_db)):
    rows = db.query(KnowledgeDocument).options(joinedload(KnowledgeDocument.chunks)).order_by(KnowledgeDocument.id.desc()).all()
    return [
        {
            "id": row.id,
            "document_code": row.document_code,
            "title": row.title,
            "version": row.version,
            "category": row.category.value,
            "status": row.status.value,
            "effective_date": row.effective_date,
            "expiry_date": row.expiry_date,
            "chunk_count": len(row.chunks),
        }
        for row in rows
    ]


@router.patch("/documents/{document_id}/status")
def update_status(document_id: int, status: str, user: AdminUser, db: Session = Depends(get_db)):
    doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.status = DocumentStatus(status)
    if doc.status == DocumentStatus.active:
        _supersede_previous(db, doc)
        flag_complaints_on_policy_change(db, doc)
    db.commit()
    return {"id": doc.id, "status": doc.status.value}


def _supersede_previous(db: Session, current: KnowledgeDocument) -> None:
    previous_rows = (
        db.query(KnowledgeDocument)
        .filter(
            KnowledgeDocument.document_code == current.document_code,
            KnowledgeDocument.id != current.id,
            KnowledgeDocument.status == DocumentStatus.active,
        )
        .all()
    )
    for row in previous_rows:
        row.status = DocumentStatus.previous
        row.superseded_by_id = current.id
