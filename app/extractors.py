"""IEP and Lesson extractors."""
from __future__ import annotations

from .llm import LLMClient
from .schemas import Lesson, StudentProfile


IEP_PREAMBLE = """You are a special-education data analyst. Your job is to read an IEP \
(Individualized Education Program) carefully and produce a structured StudentProfile. \
This is a legal document — accuracy and verbatim sourcing matter."""

IEP_INSTRUCTIONS = """Read the <iep_document> in the system context and extract a complete StudentProfile.

Hard rules:
1. For every Accommodation, the `source_quote` MUST be verbatim text from the \
"ACCOMMODATIONS AND MODIFICATIONS" table. Do not paraphrase.
2. `behavioral_patterns` should capture concrete patterns the team named — e.g. \
"shuts down when frustrated", "asks for restroom multiple times to avoid difficult tasks". \
Use the IEP's own phrasing where possible.
3. `present_levels_academic` and `present_levels_behavioral` should be 2-4 sentence \
summaries that include the most decision-relevant facts (current reading/math level, \
specific avoidance behaviors, what works in 1:1 vs whole group, etc.).
4. `interests` and `strengths` come from the "Strengths, interest areas, and preferences" cells.
5. For each Annual Goal, copy the baseline narrative; the target should be the measurable \
annual goal sentence; benchmarks are the short-term objectives.
6. Use the actual student name. Use the actual disability label.

Now call the `submit` tool with the StudentProfile."""


LESSON_PREAMBLE = """You are a curriculum analyst. Your job is to read a teacher-facing \
lesson plan and produce a structured Lesson object that downstream tools can modify."""

LESSON_INSTRUCTIONS = """Read the <lesson_document> in the system context and extract a complete Lesson.

Hard rules:
1. `passage_text` should contain the COMPLETE reading passage from the lesson — every \
numbered paragraph from [1] through the end. Preserve the paragraph numbers like "[1]" \
"[2]" at the start of each paragraph. Do NOT include teacher questions, vocabulary boxes, \
or footnotes — only the reading itself. Plain text — do not escape inner quotes.
2. Pull out the multiple-choice questions verbatim with all four choices in order \
(strip the leading letter — keep just the choice text). Set `correct_index` to null unless \
the source clearly indicates the answer.
3. The `short_response_prompt` should be the full prompt text from the Independent Practice page.
4. `discussion_questions` come from the Student-Led Discussion page.
5. `estimated_reading_level` should be your honest grade-level estimate of the source text \
(the Toby Lowe essay), e.g. "Grade 7-8" or a Lexile estimate.
6. `vocabulary` includes the words listed in the "Vocabulary" box AND any bolded \
unit-vocabulary words used in the questions (aspect, narrative, moral, specific, courteous, \
conforming, manifestation, dispersed, essence, solidarity).

Now call the `submit` tool with the Lesson."""


async def extract_student_profile(client: LLMClient) -> StudentProfile:
    return await client.extract_structured(
        step_name="extract_iep",
        output_model=StudentProfile,
        role_preamble=IEP_PREAMBLE,
        instructions=IEP_INSTRUCTIONS,
        max_tokens=8192,
    )


async def extract_lesson(client: LLMClient) -> Lesson:
    return await client.extract_structured(
        step_name="extract_lesson",
        output_model=Lesson,
        role_preamble=LESSON_PREAMBLE,
        instructions=LESSON_INSTRUCTIONS,
        max_tokens=8192,
    )
