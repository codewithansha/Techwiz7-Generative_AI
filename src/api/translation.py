"""Multilingual Intelligence API router for SupportNova.

Provides language discovery, real-time detection, translation endpoints,
and customer language preference management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.models import Customer, User, UserRole
from database.session import get_db
from security.auth import CurrentUser
from src.api.schemas import (
    CustomerLanguageUpdate,
    TranslateRequest,
    TranslateResponse,
    TranslationDetectRequest,
    TranslationDetectResponse,
)
from src.services.multilingual import (
    SUPPORTED_LANGUAGES,
    detect_language,
    translate_message,
)

router = APIRouter(prefix="/api/v1/translation", tags=["translation"])


@router.get("/languages")
def list_languages():
    """List languages supported by SupportNova's Multilingual Intelligence layer."""
    return [
        {"code": code, "name": meta["name"], "native_name": meta["native_name"]}
        for code, meta in SUPPORTED_LANGUAGES.items()
    ]


@router.post("/detect", response_model=TranslationDetectResponse)
def detect_endpoint(payload: TranslationDetectRequest):
    """Detect the language of the provided text with confidence and script metadata."""
    detection = detect_language(payload.text)
    return TranslationDetectResponse(
        language=detection.code,
        language_name=detection.name,
        confidence=detection.confidence,
        is_mixed=detection.is_mixed,
    )


@router.post("/translate", response_model=TranslateResponse)
def translate_endpoint(payload: TranslateRequest):
    """Translate text between customer and staff languages preserving terminology."""
    try:
        result = translate_message(
            payload.text,
            target_lang=payload.target_language,
            source_lang=payload.source_language,
        )
        return TranslateResponse(
            original_text=result["original_text"],
            translated_text=result["translated_text"],
            source_language=result["source_language"],
            target_language=result["target_language"],
            confidence=result.get("confidence", 0.95),
            status="completed",
        )
    except Exception as exc:
        # Graceful fallback: return original text with failed status
        return TranslateResponse(
            original_text=payload.text,
            translated_text=payload.text,
            source_language=payload.source_language or "auto",
            target_language=payload.target_language,
            confidence=0.0,
            status="failed",
        )


@router.get("/preference")
def get_language_preference(user: CurrentUser, db: Session = Depends(get_db)):
    """Get the current customer's preferred language."""
    if user.role == UserRole.customer:
        customer = db.query(Customer).filter(Customer.user_id == user.id).first()
        pref = getattr(customer, "preferred_language", "auto") if customer else "auto"
    else:
        pref = "en"
    return {"preferred_language": pref or "auto"}


@router.put("/preference")
def set_language_preference(
    payload: CustomerLanguageUpdate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Update the current customer's preferred language."""
    pref = payload.preferred_language.strip().lower()
    if pref not in SUPPORTED_LANGUAGES:
        valid_codes = ", ".join(SUPPORTED_LANGUAGES.keys())
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported language code '{pref}'. Valid options: {valid_codes}",
        )

    if user.role == UserRole.customer:
        customer = db.query(Customer).filter(Customer.user_id == user.id).first()
        if customer:
            customer.preferred_language = pref
            db.commit()
    return {"preferred_language": pref, "status": "updated"}
