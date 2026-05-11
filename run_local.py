"""CLI runner: read two PDFs, run the pipeline, write the JSON result."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from app.pipeline import run_pipeline


async def main(lesson: Path, iep: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    lesson_bytes = lesson.read_bytes()
    iep_bytes = iep.read_bytes()

    print(f"running pipeline on {lesson.name} + {iep.name} ...")
    result = await run_pipeline(lesson_pdf_bytes=lesson_bytes, iep_pdf_bytes=iep_bytes)

    json_path = out / "result.json"
    json_path.write_text(json.dumps(result.model_dump(mode="json"), indent=2))
    print(f"  wrote {json_path} ({json_path.stat().st_size:,} bytes)")

    v = result.verification
    print()
    print("verification:")
    print(f"  readability: FK {v.readability.original_fk_grade} -> {v.readability.modified_fk_grade} (target {v.readability.target_grade}, met={v.readability.target_met})")
    print(f"  citations:   {v.total_iep_citations} across {len(result.plan.modifications)} modifications (every_mod_cited={v.every_mod_has_citation})")
    print(f"  central idea preserved: {v.central_idea_preserved}")
    if v.warnings:
        print("  warnings:")
        for w in v.warnings:
            print(f"    - {w}")
    print()
    print("step timings (ms):")
    for k, val in result.timings_ms.items():
        print(f"  {k:30s}  {val}")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--lesson", default="lesson.pdf")
    p.add_argument("--iep", default="iep.pdf")
    p.add_argument("--out", default="examples")
    return p.parse_args()


if __name__ == "__main__":
    load_dotenv()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set. Put it in .env or export it.")
    args = parse_args()
    asyncio.run(main(Path(args.lesson), Path(args.iep), Path(args.out)))
