"""Modification planner."""
from __future__ import annotations

import json

from .llm import DEFAULT_MODEL_SMART, LLMClient
from .schemas import Lesson, ModificationPlan, StudentProfile


PLANNER_PREAMBLE = """You are a senior special-education specialist with deep knowledge of \
IDEA, IEPs, and evidence-based instructional modifications. You translate IEPs into \
concrete, defensible classroom modifications. Every recommendation you make must trace \
back to a specific, verbatim line in the student's IEP."""


def _instructions(student: StudentProfile, lesson: Lesson) -> str:
    student_json = student.model_dump_json(indent=2)
    lesson_summary = {
        "title": lesson.title,
        "grade_level": lesson.grade_level,
        "standard": lesson.standard,
        "skill_focus": lesson.skill_focus,
        "estimated_reading_level": lesson.estimated_reading_level,
        "vocabulary_count": len(lesson.vocabulary),
        "passage_char_count": len(lesson.passage_text),
        "mc_question_count": len(lesson.multiple_choice_questions),
        "short_response_prompt": lesson.short_response_prompt,
    }
    lesson_json = json.dumps(lesson_summary, indent=2)

    return f"""You will produce a ModificationPlan for ONE student doing ONE lesson.

# Student profile (already structured)
```json
{student_json}
```

# Lesson summary (the full text is in the system <lesson_document>)
```json
{lesson_json}
```

# Your task

Think carefully about:
1. **Lesson demands** — what cognitive/reading load does this lesson put on a typical \
on-grade student? (vocabulary load, reading level, abstract reasoning, writing demands, \
attention duration)
2. **Student capacity vs demands** — where specifically does this student fall short of \
those demands? Use the IEP's reading/math levels, behavioral patterns, and goals.
3. **Required modifications** — what concrete changes will let this student access the \
SAME central idea and skill standard?

Then emit a `ModificationPlan` with:

- `gap_analysis`: 2-4 sentences describing the lesson-vs-student gap concretely.
- `student_specific_summary`: 1-2 sentences naming the IEP elements that drive the plan.
- `modifications`: a list covering EACH of these six types exactly once, with id 'mod-1' \
through 'mod-6':
    1. `leveled_text` — rewrite the source passage at the student's reading level
    2. `vocab_support` — pre-teach the unit/lesson vocab the student would otherwise miss
    3. `graphic_organizer` — visual scaffold for the lesson's skill (here: central idea + details)
    4. `scaffolded_mc` — modified versions of the lesson's MC questions
    5. `sentence_stem_response` — scaffolded version of the short-response prompt
    6. `teacher_facilitation` — chunked pacing, behavior supports, grouping recommendation

# Citation rules (HARD)
- Every Modification needs **at least 2** `iep_citations`, drawn verbatim from the \
<iep_document>.
- Citations should come from the most relevant IEP section — Accommodations, \
Present Levels, Annual Goals, etc. Set `section` to the section heading.
- Quotes must appear word-for-word in the IEP. Do not paraphrase, do not invent.
- Prefer specific quotes ("requires graphic organizers and checklists") over generic \
ones ("Jasmine has a disability").

Now call the `submit` tool with the ModificationPlan."""


async def build_plan(client: LLMClient, student: StudentProfile, lesson: Lesson) -> ModificationPlan:
    # Text-mode JSON: tool-use sometimes stringifies the inner Citation list
    # on this nested schema (Plan -> Modification -> Citation[]).
    return await client.extract_structured_text(
        step_name="plan",
        output_model=ModificationPlan,
        role_preamble=PLANNER_PREAMBLE,
        instructions=_instructions(student, lesson),
        model=DEFAULT_MODEL_SMART,
        max_tokens=8192,
    )
