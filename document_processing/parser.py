"""Extract traceable sections from PDF, DOCX and text documents (SRS step 5).

Sections follow the document's own numbered headings ("5.2 Delayed delivery"), so a rule
that cites DEL-POL-04 §5.2 points at a real chunk. Page numbers are kept for PDFs, and
running headers/footers repeated on every page are dropped.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

# "5.2 Delayed delivery", "3. Approval", "Section 4.1 - Refund timeline"
HEADING = re.compile(r"^(?:section\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s*[-–:]?\s+([A-Z][^\n]{1,90})$", re.I)


def parse_document(path: Path, content: bytes | None = None) -> list[dict]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _parse_pdf(path)
    if ext == ".docx":
        return _parse_docx(path)
    text = content.decode("utf-8", errors="ignore") if content is not None else path.read_text(encoding="utf-8", errors="ignore")
    return _split_numbered([(1, line) for line in text.splitlines()], path.stem)


def section_number(heading: str) -> str | None:
    match = HEADING.match((heading or "").strip())
    return match.group(1) if match else None


def _split_numbered(lines: list[tuple[int | None, str]], title: str) -> list[dict]:
    """Group (page, line) pairs into sections at each numbered heading."""
    sections: list[dict] = []
    current = {"heading": title, "section": "0", "page_number": lines[0][0] if lines else None, "lines": []}
    for page, raw in lines:
        line = raw.strip()
        if not line:
            continue
        match = HEADING.match(line)
        # A heading is short and not a sentence; a numbered list item inside prose is not one.
        if match and len(line) <= 95 and not line.endswith((".", ",", ";")) or (match and line.count(" ") <= 6):
            if current["lines"]:
                sections.append(current)
            current = {"heading": line, "section": match.group(1), "page_number": page, "lines": []}
        else:
            current["lines"].append(line)
    if current["lines"]:
        sections.append(current)
    blocks = [
        {"heading": s["heading"], "section": s["section"], "page_number": s["page_number"], "content": "\n".join(s["lines"])}
        for s in sections
    ]
    # Documents without numbered headings keep one section per original block.
    return blocks or [{"heading": title, "section": "1", "page_number": 1, "content": "\n".join(l for _, l in lines)}]


def _parse_pdf(path: Path) -> list[dict]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return [{"heading": path.stem, "section": path.stem, "page_number": 1, "content": ""}]
    pages: list[tuple[int, list[str]]] = []
    with fitz.open(path) as doc:
        for index, page in enumerate(doc, start=1):
            pages.append((index, [l for l in page.get_text("text").splitlines() if l.strip()]))
    # Lines that appear on most pages are running headers/footers ("Page 3", document banner).
    counts = Counter(_normalise(l) for _, lines in pages for l in set(lines))
    repeated = {line for line, n in counts.items() if len(pages) > 1 and n >= max(2, int(0.6 * len(pages)))}
    lines = [
        (page, line)
        for page, page_lines in pages
        for line in page_lines
        if _normalise(line) not in repeated and not re.fullmatch(r"(page\s*)?\d+(\s*(of|/)\s*\d+)?", line.strip(), re.I)
    ]
    return _split_numbered(lines, path.stem)


def _normalise(line: str) -> str:
    return re.sub(r"\d+", "#", line.strip().lower())


def _parse_docx(path: Path) -> list[dict]:
    from docx import Document

    document = Document(path)
    blocks: list[dict] = []
    current_heading = path.stem
    buffer: list[str] = []
    ordinal = 0

    def flush() -> None:
        nonlocal ordinal
        if buffer:
            ordinal += 1
            blocks.append(
                {
                    "heading": current_heading,
                    "section": section_number(current_heading) or ("0" if ordinal == 1 else str(ordinal)),
                    "page_number": None,
                    "content": "\n".join(buffer),
                }
            )

    for para in document.paragraphs:
        style = (para.style.name or "").lower() if para.style else ""
        text = para.text.strip()
        if not text:
            continue
        if "heading" in style or "title" in style:
            flush()
            buffer = []
            current_heading = text
        else:
            buffer.append(text)
    flush()
    # Tables (e.g. version history) are content too.
    for table in document.tables:
        rows = [" | ".join(cell.text.strip() for cell in row.cells) for row in table.rows]
        if rows:
            blocks.append({"heading": "Table", "section": f"T{len(blocks) + 1}", "page_number": None, "content": "\n".join(rows)})
    return blocks
