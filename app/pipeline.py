"""Pipeline orchestrator: PDFs in → ModifyResponse out."""
from __future__ import annotations

import asyncio
from typing import Callable, Optional

from .extractors import extract_lesson, extract_student_profile
from .generators import generate_all
from .llm import LLMClient
from .parsers import parse_pdf_bytes
from .planner import build_plan
from .schemas import ModifyResponse
from .verify import verify

ProgressCallback = Callable[[int, str], None]


def _safe_call(cb: Optional[ProgressCallback], pct: int, step: str) -> None:
    if cb is None:
        return
    try:
        cb(pct, step)
    except Exception:
        pass


async def run_pipeline(
    *,
    lesson_pdf_bytes: bytes,
    iep_pdf_bytes: bytes,
    progress_cb: Optional[ProgressCallback] = None,
) -> ModifyResponse:
    _safe_call(progress_cb, 2, "parsing PDFs")
    lesson_text = parse_pdf_bytes(lesson_pdf_bytes)
    iep_text = parse_pdf_bytes(iep_pdf_bytes)
    _safe_call(progress_cb, 5, "documents parsed")

    client = LLMClient(lesson_text=lesson_text, iep_text=iep_text)

    _safe_call(progress_cb, 8, "reading the IEP and the lesson")
    student, lesson = await asyncio.gather(
        extract_student_profile(client),
        extract_lesson(client),
    )
    _safe_call(progress_cb, 35, "structured the IEP and the lesson")

    _safe_call(progress_cb, 38, "planning modifications")
    plan = await build_plan(client, student, lesson)
    _safe_call(progress_cb, 70, "plan ready · 6 modifications cited")

    artifacts = await generate_all(client, student, lesson, plan, progress_cb=progress_cb)
    _safe_call(progress_cb, 95, "all artifacts generated")

    _safe_call(progress_cb, 96, "verifying readability and central idea")
    verification = await verify(client, lesson, plan, artifacts)
    _safe_call(progress_cb, 100, "complete")

    timings = dict(client.timings_ms)
    for k, v in client.cache_metrics.items():
        timings[f"_tokens_{k}"] = v

    return ModifyResponse(
        student=student,
        lesson=lesson,
        plan=plan,
        artifacts=artifacts,
        verification=verification,
        timings_ms=timings,
    )
