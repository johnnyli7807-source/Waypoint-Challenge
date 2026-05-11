"""Three-pronged verification: readability + citation completeness + central-idea judge."""
from __future__ import annotations

import textstat
from pydantic import BaseModel

from .llm import LLMClient
from .schemas import (
    GeneratedArtifacts,
    Lesson,
    ModificationPlan,
    ReadabilityCheck,
    VerificationReport,
)


class _CentralIdeaJudgment(BaseModel):
    preserved: bool
    rationale: str


def _full_passage(lesson: Lesson) -> str:
    return lesson.passage_text


async def verify(
    client: LLMClient,
    lesson: Lesson,
    plan: ModificationPlan,
    artifacts: GeneratedArtifacts,
) -> VerificationReport:
    warnings: list[str] = []

    original_passage = _full_passage(lesson)
    modified_passage = artifacts.leveled_text.passage
    original_fk = float(textstat.flesch_kincaid_grade(original_passage))
    modified_fk = float(textstat.flesch_kincaid_grade(modified_passage))
    target = artifacts.leveled_text.target_grade_level
    # +1.0 grade slack: ZPD-aligned text for a G3 reader sits at G4–G5 with
    # scaffolds; stricter targets risk producing text that reads as babyish.
    target_met = modified_fk <= target + 1.0
    if not target_met:
        warnings.append(
            f"Leveled text scored FK {modified_fk:.1f} vs target {target:.1f} (+1 slack); consider re-running."
        )
    readability = ReadabilityCheck(
        original_fk_grade=round(original_fk, 1),
        modified_fk_grade=round(modified_fk, 1),
        target_grade=target,
        target_met=target_met,
    )

    every_mod_has_citation = all(len(m.iep_citations) >= 1 for m in plan.modifications)
    total_iep_citations = sum(len(m.iep_citations) for m in plan.modifications)
    if not every_mod_has_citation:
        missing = [m.id for m in plan.modifications if not m.iep_citations]
        warnings.append(f"Modifications missing IEP citations: {missing}")

    judgment = await _judge_central_idea(client, original_passage, modified_passage)
    if not judgment.preserved:
        warnings.append("Central idea may have drifted in the leveled text — review.")

    return VerificationReport(
        readability=readability,
        every_mod_has_citation=every_mod_has_citation,
        total_iep_citations=total_iep_citations,
        central_idea_preserved=judgment.preserved,
        central_idea_judgment=judgment.rationale,
        warnings=warnings,
    )


async def _judge_central_idea(client: LLMClient, original: str, modified: str) -> _CentralIdeaJudgment:
    instructions = f"""Compare the central idea of the ORIGINAL passage to the MODIFIED \
(simplified) passage and judge whether the central idea is preserved.

ORIGINAL (truncated to first 4000 chars if longer):
{original[:4000]}

MODIFIED:
{modified}

The lesson's intended skill is RI.7.2 — determining and summarizing the central idea. \
The original's central idea is, roughly: a community is a group of people who share an \
identity-forming narrative (story).

Set `preserved` to true ONLY if the modified text would lead a reader to the same \
central idea. If the modified text drifts, state where in `rationale`.

Now call submit."""

    return await client.extract_structured(
        step_name="verify_central_idea",
        output_model=_CentralIdeaJudgment,
        role_preamble="You are a literacy-assessment specialist judging central-idea preservation.",
        instructions=instructions,
        max_tokens=512,
    )
