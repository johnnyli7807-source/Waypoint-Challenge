"""Six artifact generators, run in parallel."""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional, TypeVar

from .llm import LLMClient
from .schemas import (
    GeneratedArtifacts,
    GraphicOrganizer,
    LeveledText,
    Lesson,
    ModificationPlan,
    ModificationType,
    ScaffoldedMCQ,
    SentenceStemResponse,
    StudentProfile,
    TeacherGuide,
    VocabCard,
)


def _mod_ids_for(plan: ModificationPlan, *types: ModificationType) -> list[str]:
    return [m.id for m in plan.modifications if m.type in types]


def _full_passage(lesson: Lesson) -> str:
    return lesson.passage_text


async def gen_leveled_text(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> LeveledText:
    passage = _full_passage(lesson)
    instructions = f"""Rewrite the following passage at a grade 4 reading level for \
{student.student_name}, who reads at {student.reading_level}. The original is here:

<original_passage>
{passage}
</original_passage>

Hard rules:
1. Preserve the central idea exactly: that a community is a group of people who share \
an identity-forming narrative (story). The reader should arrive at the same answer to \
RI.7.2 (central idea + supporting details) as a reader of the original.
2. Keep the author's Newcastle example — it's load-bearing for understanding the \
definition.
3. **Sentence length: NO sentence may exceed 15 words. Most should be 8–12 words.** \
Use simple subject-verb-object structure. Prefer ".\\n" over ";", "," + and, etc.
4. **Vocabulary: only use words a 4th-grader knows.** When you must use a unit-vocab \
word (narrative, aspect, moral, specific), define it inline the first time, e.g. \
"a narrative (a story)".
5. Add **2–3 bolded mini-headings** to chunk the passage so it isn't a wall of text.
6. Set `target_grade_level` to 4.5. (We allow up to FK 5.5 in verification.)
7. Set `modification_ids` to the leveled_text modification id from the plan.
8. `notes_to_teacher`: ONE short paragraph, 2–4 sentences, plain prose. No markdown, no bullet lists, no metadata blocks like "Student: ... | IEP ID: ...". Just a brief note on what the rewrite preserves and what to watch for.

Self-check before submitting: read your passage and rewrite any sentence over 15 words.

Plan modifications for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    artifact = await client.extract_structured(
        step_name="gen_leveled_text",
        output_model=LeveledText,
        role_preamble="You are a literacy specialist who rewrites texts for striving readers while preserving central meaning.",
        instructions=instructions,
        max_tokens=4096,
    )
    if not artifact.modification_ids:
        artifact.modification_ids = _mod_ids_for(plan, ModificationType.leveled_text)
    return artifact


async def gen_vocab_card(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> VocabCard:
    vocab_list = "\n".join(f"- {v.word}" for v in lesson.vocabulary)
    interests = ", ".join(student.interests) or "general age-appropriate"
    instructions = f"""Build a pre-teach vocabulary card for {student.student_name}. \
She reads at {student.reading_level} and her strengths include: {', '.join(student.strengths)}. \
Her interests/preferences: {interests}.

Lesson vocabulary to pre-teach:
{vocab_list}

For each word, produce a `VocabEntry` with:
- `kid_friendly_definition`: one sentence, ~10 words, using ONLY words at or below grade 3
- `visual_cue`: a SHORT description of a sketch/drawing/icon a teacher could draw on a \
notecard. Lean into Jasmine's interests where natural (she loves drawing).
- `example_sentence`: one short sentence using the word in a 7th-grade-classroom-relevant \
context (so she connects it to the lesson).

Set modification_ids to the vocab_support modification id from the plan.

Plan for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    artifact = await client.extract_structured(
        step_name="gen_vocab_card",
        output_model=VocabCard,
        role_preamble="You are a vocabulary instruction specialist for striving readers.",
        instructions=instructions,
        max_tokens=4096,
    )
    if not artifact.modification_ids:
        artifact.modification_ids = _mod_ids_for(plan, ModificationType.vocab_support)
    return artifact


async def gen_graphic_organizer(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> GraphicOrganizer:
    instructions = f"""Build a printable graphic organizer for the lesson skill: \
{lesson.skill_focus} (standard: {lesson.standard}).

For {student.student_name}, the organizer should:
- Use a "Central Idea + 3 Supporting Details" structure (the standard skill for RI.7.2).
- Be representable in printable text. Use box-drawing characters (┌ ─ │ └ ┘ ├) or \
simple ASCII boxes inside `structure_markdown`. It must look like a real organizer when \
printed in a monospace font.
- Provide 4-6 `sentence_stems` she can use to fill in the organizer (e.g., "The author's \
central idea is ___ because ___").
- Title it with the lesson title.

Set `organizer_type` to "Central Idea + 3 Supporting Details".
Set modification_ids to the graphic_organizer modification id from the plan.

Plan for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    artifact = await client.extract_structured(
        step_name="gen_graphic_organizer",
        output_model=GraphicOrganizer,
        role_preamble="You design printable graphic organizers that scaffold reading-comprehension skills.",
        instructions=instructions,
        max_tokens=4096,
    )
    if not artifact.modification_ids:
        artifact.modification_ids = _mod_ids_for(plan, ModificationType.graphic_organizer)
    return artifact


async def gen_scaffolded_mc(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> list[ScaffoldedMCQ]:
    """Generate a scaffolded version of EACH of the lesson's MC questions."""
    if not lesson.multiple_choice_questions:
        return []

    mcq_json = "\n".join(
        f"Q{q.number} ({q.standard or 'no standard'}): {q.stem}\n  A) {q.choices[0] if len(q.choices)>0 else ''}\n  B) {q.choices[1] if len(q.choices)>1 else ''}\n  C) {q.choices[2] if len(q.choices)>2 else ''}\n  D) {q.choices[3] if len(q.choices)>3 else ''}\n  correct_index: {q.correct_index}"
        for q in lesson.multiple_choice_questions
    )

    from pydantic import BaseModel

    class ScaffoldedMCQList(BaseModel):
        items: list[ScaffoldedMCQ]

    instructions = f"""Produce a scaffolded version of EACH of these multiple-choice questions \
for {student.student_name} (reads at {student.reading_level}; pattern: shuts down under \
academic frustration; benefits from reduced cognitive load).

Original questions:
{mcq_json}

For each question:
- `original_number`: the question number from the source.
- `original_stem`: copy the original stem.
- `modified_stem`: rewrite at grade 3 level. Make the question concrete. Avoid double \
negatives. Keep it the SAME question, not a different one.
- `choices`: REDUCE to 2-3 plausible choices (drop the most clearly-wrong distractors). \
Keep the correct answer in. Simplify wording.
- `correct_index`: 0-based index of the correct answer in YOUR new choices array.
- `why_others_are_wrong`: one short kid-friendly sentence per wrong choice.
- `modification_ids`: the scaffolded_mc modification id from the plan.

Return all questions in `items`.

Plan for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    container = await client.extract_structured(
        step_name="gen_scaffolded_mc",
        output_model=ScaffoldedMCQList,
        role_preamble="You scaffold assessment items for striving readers without lowering rigor.",
        instructions=instructions,
        max_tokens=4096,
    )
    items = container.items
    mod_ids = _mod_ids_for(plan, ModificationType.scaffolded_mc)
    for item in items:
        if not item.modification_ids:
            item.modification_ids = mod_ids
    return items


async def gen_sentence_stem_response(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> SentenceStemResponse:
    instructions = f"""Build a scaffolded short-response prompt for {student.student_name}.

Original prompt:
\"\"\"{lesson.short_response_prompt}\"\"\"

Produce:
- `original_prompt`: copy verbatim.
- `modified_prompt`: same question, simpler language, broken into 2 short sentences if needed.
- `sentence_starters`: 4-5 starters that scaffold a complete paragraph response. e.g. \
"Lowe says a community is ___." → "One example from the text is ___." → "This shows that ___."
- `success_criteria_kid_friendly`: 3 bullets in kid language. e.g. "I used the word \
'narrative'", "I gave 2 details from the text".
- `modification_ids`: the sentence_stem_response modification id from the plan.

Plan for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    artifact = await client.extract_structured(
        step_name="gen_sentence_stem_response",
        output_model=SentenceStemResponse,
        role_preamble="You scaffold writing prompts for striving writers.",
        instructions=instructions,
        max_tokens=2048,
    )
    if not artifact.modification_ids:
        artifact.modification_ids = _mod_ids_for(plan, ModificationType.sentence_stem_response)
    return artifact


async def gen_teacher_guide(
    client: LLMClient, student: StudentProfile, lesson: Lesson, plan: ModificationPlan
) -> TeacherGuide:
    accom_lines = "\n".join(f"- [{a.category}] {a.text}" for a in student.accommodations)
    behav_lines = "\n".join(f"- {p}" for p in student.behavioral_patterns)
    instructions = f"""Build a teacher-facing facilitation guide for {student.student_name} \
during this 45-minute lesson.

Her accommodations:
{accom_lines}

Her behavioral patterns:
{behav_lines}

Her strengths/interests: {', '.join(student.strengths + student.interests)}

Produce a TeacherGuide with:
- `pacing_chunks`: ~5-7 FacilitationStep entries that walk through the lesson \
chronologically (Before reading, During reading paragraphs 1-2, etc.). Each `when` should \
be specific. Each `teacher_action` should be concrete (1-2 sentences). Each \
`rationale_short` should reference an accommodation or pattern.
- `behavioral_supports`: 3-5 entries triggered by specific cues (e.g., "When Jasmine puts \
her head down" → "Offer a sensory tool, validate, redirect to the next chunk in the \
graphic organizer"). Each rationale_short references the IEP self-regulation goal or \
shutdown pattern.
- `grouping_recommendation`: 1-3 sentences. Use her IEP service delivery info — she has \
55 min daily SE in ELA in the gen-ed classroom. Recommend small-group pull-out vs \
inclusion based on the section difficulty.
- `praise_scripts`: 3-5 short specific praise sentences ("I noticed you used your \
graphic organizer to find the central idea — that's exactly what good readers do.").
- `modification_ids`: the teacher_facilitation modification id from the plan.

Plan for reference:
{plan.model_dump_json(indent=2)}

Now call submit."""

    artifact = await client.extract_structured(
        step_name="gen_teacher_guide",
        output_model=TeacherGuide,
        role_preamble="You coach general-education teachers on day-of facilitation for students with IEPs.",
        instructions=instructions,
        max_tokens=4096,
    )
    if not artifact.modification_ids:
        artifact.modification_ids = _mod_ids_for(plan, ModificationType.teacher_facilitation)
    return artifact


T = TypeVar("T")
ProgressCallback = Callable[[int, str], None]


async def generate_all(
    client: LLMClient,
    student: StudentProfile,
    lesson: Lesson,
    plan: ModificationPlan,
    progress_cb: Optional[ProgressCallback] = None,
) -> GeneratedArtifacts:
    """Fan out 6 generators in parallel. One retry per failure, then a typed default."""
    PROGRESS_START, PROGRESS_END = 70, 95
    total = 6
    completed = [0]

    async def with_progress(name: str, coro: Awaitable[T]) -> T:
        try:
            result = await coro
        finally:
            completed[0] += 1
            if progress_cb is not None:
                pct = PROGRESS_START + int((PROGRESS_END - PROGRESS_START) * completed[0] / total)
                try:
                    progress_cb(pct, f"generated {name.replace('_', ' ')}")
                except Exception:
                    pass
        return result

    results = await asyncio.gather(
        with_progress("leveled_text", gen_leveled_text(client, student, lesson, plan)),
        with_progress("vocab_card", gen_vocab_card(client, student, lesson, plan)),
        with_progress("graphic_organizer", gen_graphic_organizer(client, student, lesson, plan)),
        with_progress("scaffolded_mc", gen_scaffolded_mc(client, student, lesson, plan)),
        with_progress("sentence_stem_response", gen_sentence_stem_response(client, student, lesson, plan)),
        with_progress("teacher_guide", gen_teacher_guide(client, student, lesson, plan)),
        return_exceptions=True,
    )
    leveled, vocab, organizer, mcs, response, guide = results

    # One-shot retries for any failures.
    retry_map = {
        0: ("leveled_text", lambda: gen_leveled_text(client, student, lesson, plan)),
        1: ("vocab_card", lambda: gen_vocab_card(client, student, lesson, plan)),
        2: ("graphic_organizer", lambda: gen_graphic_organizer(client, student, lesson, plan)),
        3: ("scaffolded_mc", lambda: gen_scaffolded_mc(client, student, lesson, plan)),
        4: ("sentence_stem_response", lambda: gen_sentence_stem_response(client, student, lesson, plan)),
        5: ("teacher_guide", lambda: gen_teacher_guide(client, student, lesson, plan)),
    }
    for idx, (name, fn) in retry_map.items():
        if isinstance(results[idx], Exception):
            try:
                results[idx] = await fn()
            except Exception as e:
                print(f"  [warn] generator '{name}' failed twice: {e!s}")

    leveled, vocab, organizer, mcs, response, guide = results

    # Substitute safe defaults if a generator still failed after retry.
    if isinstance(leveled, Exception):
        leveled = LeveledText(
            title=lesson.title,
            passage="(generation failed — please re-run)",
            target_grade_level=3.5,
            preserved_central_idea="(unavailable)",
            notes_to_teacher="Leveled-text generation failed; please re-run the pipeline.",
            modification_ids=_mod_ids_for(plan, ModificationType.leveled_text),
        )
    if isinstance(vocab, Exception):
        vocab = VocabCard(words=[], modification_ids=_mod_ids_for(plan, ModificationType.vocab_support))
    if isinstance(organizer, Exception):
        organizer = GraphicOrganizer(
            title=lesson.title,
            organizer_type="Central Idea + 3 Supporting Details",
            structure_markdown="(generation failed — please re-run)",
            sentence_stems=[],
            modification_ids=_mod_ids_for(plan, ModificationType.graphic_organizer),
        )
    if isinstance(mcs, Exception):
        mcs = []
    if isinstance(response, Exception):
        response = SentenceStemResponse(
            original_prompt=lesson.short_response_prompt,
            modified_prompt="(generation failed — please re-run)",
            sentence_starters=[],
            success_criteria_kid_friendly=[],
            modification_ids=_mod_ids_for(plan, ModificationType.sentence_stem_response),
        )
    if isinstance(guide, Exception):
        guide = TeacherGuide(
            pacing_chunks=[],
            behavioral_supports=[],
            grouping_recommendation="(generation failed — please re-run)",
            praise_scripts=[],
            modification_ids=_mod_ids_for(plan, ModificationType.teacher_facilitation),
        )

    return GeneratedArtifacts(
        leveled_text=leveled,
        vocab_card=vocab,
        graphic_organizer=organizer,
        scaffolded_mc=mcs,
        sentence_stem_response=response,
        teacher_guide=guide,
    )
