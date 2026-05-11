"""SQLite job store."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(os.environ.get("MODULUS_DB_PATH", "data/modulus.db"))


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


_CONN: Optional[sqlite3.Connection] = None


def conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        _CONN = _connect()
        _init_schema(_CONN)
    return _CONN


def _init_schema(c: sqlite3.Connection) -> None:
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id              TEXT PRIMARY KEY,
            status          TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
            progress_pct    INTEGER NOT NULL DEFAULT 0,
            progress_step   TEXT,
            error           TEXT,

            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL,
            completed_at    TEXT,

            lesson_filename     TEXT,
            iep_filename        TEXT,
            lesson_size_bytes   INTEGER,
            iep_size_bytes      INTEGER,

            student_name    TEXT,
            student_grade   TEXT,
            lesson_title    TEXT,

            result_json     TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);

        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    c.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('demo_limit', '10')")
    c.commit()


def create_job(
    *,
    lesson_filename: str,
    iep_filename: str,
    lesson_size_bytes: int,
    iep_size_bytes: int,
) -> str:
    job_id = uuid.uuid4().hex[:16]
    now = _utcnow()
    c = conn()
    c.execute(
        """
        INSERT INTO jobs
          (id, status, progress_pct, progress_step,
           created_at, updated_at,
           lesson_filename, iep_filename, lesson_size_bytes, iep_size_bytes)
        VALUES (?, 'queued', 0, NULL, ?, ?, ?, ?, ?, ?)
        """,
        (job_id, now, now, lesson_filename, iep_filename, lesson_size_bytes, iep_size_bytes),
    )
    c.commit()
    return job_id


def set_running(job_id: str) -> None:
    c = conn()
    c.execute(
        "UPDATE jobs SET status='running', updated_at=? WHERE id=?",
        (_utcnow(), job_id),
    )
    c.commit()


def update_progress(job_id: str, pct: int, step: str) -> None:
    pct = max(0, min(100, int(pct)))
    c = conn()
    c.execute(
        "UPDATE jobs SET progress_pct=?, progress_step=?, updated_at=? WHERE id=?",
        (pct, step, _utcnow(), job_id),
    )
    c.commit()


def mark_failed(job_id: str, error: str) -> None:
    now = _utcnow()
    c = conn()
    c.execute(
        "UPDATE jobs SET status='failed', error=?, updated_at=?, completed_at=? WHERE id=?",
        (error[:4000], now, now, job_id),
    )
    c.commit()


def mark_done(job_id: str, *, result: dict[str, Any]) -> None:
    student = result.get("student", {}) or {}
    lesson = result.get("lesson", {}) or {}
    now = _utcnow()
    c = conn()
    c.execute(
        """
        UPDATE jobs
           SET status='done',
               progress_pct=100,
               progress_step='complete',
               error=NULL,
               updated_at=?,
               completed_at=?,
               student_name=?,
               student_grade=?,
               lesson_title=?,
               result_json=?
         WHERE id=?
        """,
        (
            now,
            now,
            student.get("student_name"),
            student.get("grade_level"),
            lesson.get("title"),
            json.dumps(result),
            job_id,
        ),
    )
    c.commit()


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    c = conn()
    row = c.execute(
        """
        SELECT id, status, progress_pct, progress_step, error,
               created_at, updated_at, completed_at,
               lesson_filename, iep_filename, lesson_size_bytes, iep_size_bytes,
               student_name, student_grade, lesson_title
          FROM jobs WHERE id=?
        """,
        (job_id,),
    ).fetchone()
    return dict(row) if row else None


def get_result(job_id: str) -> Optional[dict[str, Any]]:
    c = conn()
    row = c.execute(
        "SELECT result_json FROM jobs WHERE id=? AND status='done'", (job_id,)
    ).fetchone()
    if not row or not row["result_json"]:
        return None
    return json.loads(row["result_json"])


def get_demo_limit() -> int:
    c = conn()
    row = c.execute("SELECT value FROM meta WHERE key='demo_limit'").fetchone()
    if not row:
        return 10
    try:
        return int(row["value"])
    except (TypeError, ValueError):
        return 10


def count_jobs() -> int:
    c = conn()
    row = c.execute("SELECT COUNT(*) AS n FROM jobs").fetchone()
    return int(row["n"]) if row else 0


def quota() -> dict[str, int]:
    used = count_jobs()
    limit = get_demo_limit()
    return {"used": used, "limit": limit, "remaining": max(0, limit - used)}


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    c = conn()
    rows = c.execute(
        """
        SELECT id, status, progress_pct, progress_step, error,
               created_at, completed_at,
               lesson_filename, iep_filename,
               student_name, student_grade, lesson_title
          FROM jobs
         ORDER BY created_at DESC
         LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]
