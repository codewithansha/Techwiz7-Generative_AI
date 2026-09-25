"""Policy retrieval with BM25 ranking over document chunks (SRS step 25).

A pure-Python BM25 index is built from the chunks and cached until the knowledge base
changes, so retrieval stays fast for large knowledge bases without an external service.
Active, in-date documents rank first; previous versions are heavily down-weighted;
drafts and superseded versions are only used to detect conflicts.
"""

from __future__ import annotations

import math
import re
import threading
from collections import Counter

from rapidfuzz import fuzz
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database.models import DocumentChunk, DocumentStatus, KnowledgeDocument
from knowledge_base.precedence import is_usable_policy, sort_key

TOKEN = re.compile(r"[a-zA-Z]{3,}")
STOPWORDS = {
    "the", "and", "for", "are", "with", "that", "this", "from", "have", "has", "was", "were", "will", "can", "not",
    "you", "your", "our", "but", "all", "any", "may", "must", "into", "been", "they", "their", "what", "when", "which",
    "who", "how", "does", "did", "its", "per", "than", "then", "there", "these", "those", "about", "after", "before",
}
K1, B = 1.4, 0.75
_cache: dict = {"signature": None, "index": None}
_lock = threading.Lock()


def _tokens(text: str) -> list[str]:
    return [t for t in (w.lower() for w in TOKEN.findall(text or "")) if t not in STOPWORDS]


def _stems(text: str) -> set[str]:
    """Crude stems (first five letters) of content words, enough to match inflections."""
    return {t[:5] for t in _tokens(text) if len(t) >= 4 and t not in {"draft", "could", "would", "should"}}


def _signature(db: Session):
    """Changes whenever a chunk is added or a document changes status."""
    chunks = db.query(func.count(DocumentChunk.id), func.max(DocumentChunk.id)).one()
    docs = db.query(func.count(KnowledgeDocument.id), func.max(KnowledgeDocument.updated_at)).one()
    return (*chunks, *docs)


def _index(db: Session) -> dict:
    signature = _signature(db)
    with _lock:
        if _cache["signature"] == signature:
            return _cache["index"]
        rows = db.query(DocumentChunk).options(joinedload(DocumentChunk.document)).all()
        entries, df = [], Counter()
        for chunk in rows:
            tf = Counter(_tokens(f"{chunk.heading} {chunk.content}"))
            df.update(tf.keys())
            doc = chunk.document
            entries.append(
                {
                    "tf": tf,
                    "length": sum(tf.values()),
                    "status": doc.status,
                    "doc_id": doc.id,
                    "payload": {
                        "chunk_code": chunk.chunk_code,
                        "document_code": doc.document_code,
                        "title": doc.title,
                        "version": doc.version,
                        "status": doc.status.value,
                        "category": doc.category.value,
                        "section": chunk.section,
                        "heading": chunk.heading,
                        "page_number": chunk.page_number,
                        "content": chunk.content[:1500],
                        "usable": is_usable_policy(doc),
                        "sort": sort_key(doc),
                    },
                }
            )
        n = len(entries) or 1
        index = {
            "entries": entries,
            "idf": {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()},
            "avg_length": (sum(e["length"] for e in entries) / n) if entries else 1,
        }
        _cache.update(signature=signature, index=index)
        return index


def _bm25(index: dict, query_terms: Counter, entry: dict) -> float:
    score = 0.0
    tf, length = entry["tf"], entry["length"] or 1
    for term in query_terms:
        freq = tf.get(term)
        if not freq:
            continue
        idf = index["idf"].get(term, 0.0)
        score += idf * freq * (K1 + 1) / (freq + K1 * (1 - B + B * length / index["avg_length"]))
    return score


def retrieve_policy_chunks(db: Session, query: str, limit: int = 6) -> list[dict]:
    """Best-matching approved chunks; outdated versions never outrank an active one."""
    terms = Counter(_tokens(query))
    if not terms:
        return []
    index = _index(db)
    scored = []
    for entry in index["entries"]:
        if entry["status"] not in (DocumentStatus.active, DocumentStatus.previous):
            continue
        score = _bm25(index, terms, entry)
        if score <= 0:
            continue
        weight = 1.0 if entry["payload"]["usable"] else 0.2
        scored.append((score * weight, entry["payload"]))
    scored.sort(key=lambda item: (-item[0], item[1]["sort"]))
    return [{**{k: v for k, v in p.items() if k != "sort"}, "score": round(s, 4)} for s, p in scored[:limit]]


def outdated_claims(db: Session, text: str, threshold: int = 82) -> list[dict]:
    """Sentences from superseded, previous, draft or expired documents that the complaint repeats.

    Used for the contradictory-policy challenge: a customer quoting an old or draft policy
    (e.g. "automatic 10% shipping credit") is flagged instead of silently believed.
    """
    lowered = (text or "").lower()
    if len(lowered) < 20:
        return []
    text_stems = _stems(lowered)
    found = []
    for entry in _index(db)["entries"]:
        payload = entry["payload"]
        if payload["usable"]:
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", payload["content"]):
            s = sentence.strip().lower()
            if len(s) < 25:
                continue
            stems = _stems(s)
            # Reworded claims share most content-word stems ("automatic 10 percent shipping credit").
            paraphrased = len(stems) >= 4 and len(stems & text_stems) / len(stems) >= 0.7
            if paraphrased or fuzz.partial_ratio(s, lowered) >= threshold:
                found.append({"document_code": payload["document_code"], "version": payload["version"], "status": payload["status"], "sentence": sentence.strip()})
                break
    return found
