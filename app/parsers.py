"""PDF parsing."""
from __future__ import annotations

import io
import re
from pathlib import Path

import pdfplumber

_BOILERPLATE_PATTERNS = [
    re.compile(r"^\s*Unit 1: Community and Belonging\s*$", re.IGNORECASE),
    re.compile(r"^\s*Unless otherwise noted, this content is licensed.*$", re.IGNORECASE),
    re.compile(r"^\s*Riverstone Prep Public Charter School\s*$", re.IGNORECASE),
    re.compile(r"^\s*612 Millbrook Road\s*$", re.IGNORECASE),
    re.compile(r"^\s*Worcester, Massachusetts 01609\s*$", re.IGNORECASE),
    re.compile(r"^\s*Phone: 508-555-0271\s*$", re.IGNORECASE),
    re.compile(r"^\s*School District Contact Person.*$", re.IGNORECASE),
]


def _clean_line(line: str) -> str | None:
    stripped = line.strip()
    if not stripped:
        return ""
    for pat in _BOILERPLATE_PATTERNS:
        if pat.match(stripped):
            return None
    return stripped


def _extract(pdf) -> str:
    pages_out: list[str] = []
    for i, page in enumerate(pdf.pages, start=1):
        raw = page.extract_text() or ""
        kept: list[str] = []
        for line in raw.splitlines():
            cleaned = _clean_line(line)
            if cleaned is None:
                continue
            kept.append(cleaned)
        page_text = "\n".join(kept).strip()
        if page_text:
            pages_out.append(f"--- PAGE {i} ---\n{page_text}")
    return "\n\n".join(pages_out)


def parse_pdf(path: str | Path) -> str:
    with pdfplumber.open(Path(path)) as pdf:
        return _extract(pdf)


def parse_pdf_bytes(data: bytes) -> str:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return _extract(pdf)
