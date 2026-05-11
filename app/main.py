"""FastAPI server."""
from __future__ import annotations

import asyncio
import os
import traceback
from typing import Set

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile

from . import db
from .pipeline import run_pipeline

load_dotenv()

app = FastAPI(title="Modulus", version="0.2.0")

_BG_TASKS: Set[asyncio.Task] = set()


@app.on_event("startup")
def _on_startup() -> None:
    db.conn()


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True, "key_set": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.get("/limits")
async def limits() -> dict:
    return db.quota()


async def _run_job(job_id: str, lesson_bytes: bytes, iep_bytes: bytes) -> None:
    db.set_running(job_id)

    def cb(pct: int, step: str) -> None:
        db.update_progress(job_id, pct, step)

    try:
        result = await run_pipeline(
            lesson_pdf_bytes=lesson_bytes,
            iep_pdf_bytes=iep_bytes,
            progress_cb=cb,
        )
        db.mark_done(job_id, result=result.model_dump(mode="json"))
    except Exception:
        db.mark_failed(job_id, traceback.format_exc())


def _spawn_bg(coro) -> asyncio.Task:
    # Hold a reference so GC doesn't collect a fire-and-forget task mid-run.
    task = asyncio.create_task(coro)
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return task


@app.post("/modify", status_code=202)
async def modify(
    lesson_pdf: UploadFile = File(...),
    iep_pdf: UploadFile = File(...),
) -> dict:
    # Cap is checked before any token-spending work begins.
    q = db.quota()
    if q["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "demo_limit_reached",
                "message": f"This demo is capped at {q['limit']} runs total. Contact the operator to raise the limit.",
                "used": q["used"],
                "limit": q["limit"],
            },
        )

    if not lesson_pdf.filename or not iep_pdf.filename:
        raise HTTPException(status_code=400, detail="Both lesson_pdf and iep_pdf are required.")
    lesson_bytes = await lesson_pdf.read()
    iep_bytes = await iep_pdf.read()
    if not lesson_bytes or not iep_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    job_id = db.create_job(
        lesson_filename=lesson_pdf.filename,
        iep_filename=iep_pdf.filename,
        lesson_size_bytes=len(lesson_bytes),
        iep_size_bytes=len(iep_bytes),
    )
    _spawn_bg(_run_job(job_id, lesson_bytes, iep_bytes))
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs")
async def list_jobs(limit: int = 50) -> dict:
    return {"jobs": db.list_jobs(limit=limit)}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.get("/jobs/{job_id}/result")
async def job_result(job_id: str) -> dict:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail=f"job is {job['status']}; result not ready")
    result = db.get_result(job_id)
    if not result:
        raise HTTPException(status_code=500, detail="result missing")
    return result
