"""Pydantic schemas."""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Citation(BaseModel):
    source: Literal["IEP", "Lesson"]
    section: str = Field(description="Section of the source doc, e.g. 'Accommodations', 'Present Levels - Academics'")
    quote: str = Field(description="Verbatim quote from the source")


class Accommodation(BaseModel):
    category: Literal["presentation", "response", "timing", "setting", "other"]
    text: str
    source_quote: str = Field(description="Verbatim text from the IEP accommodations table")


class AnnualGoal(BaseModel):
    area: str = Field(description="e.g. 'Counseling', 'Mathematics', 'ELA'")
    baseline: str
    target: str
    benchmarks: list[str] = Field(default_factory=list)


class StudentProfile(BaseModel):
    student_name: str
    grade_level: str
    disability: str
    reading_level: str = Field(description="e.g. 'Grade 3 (Vocab G3, Lit Comp G3, Info Comp G2)'")
    math_level: str
    present_levels_academic: str = Field(description="Narrative summary of academic present levels")
    present_levels_behavioral: str = Field(description="Narrative summary of behavioral/social/emotional present levels")
    strengths: list[str]
    interests: list[str] = Field(description="Things the student enjoys — leverage for engagement")
    behavioral_patterns: list[str] = Field(
        description="Patterns the team should plan around, e.g. 'shuts down under academic frustration'"
    )
    accommodations: list[Accommodation]
    modifications: list[str] = Field(default_factory=list)
    annual_goals: list[AnnualGoal]
    english_learner: bool = False
    requires_aac: bool = False


class VocabularyTerm(BaseModel):
    word: str
    pronunciation: Optional[str] = None
    definition: Optional[str] = None


class MultipleChoiceQuestion(BaseModel):
    number: int
    standard: Optional[str] = Field(default=None, description="e.g. 'RI.6'")
    stem: str
    choices: list[str] = Field(description="A, B, C, D in order")
    correct_index: Optional[int] = Field(default=None, description="0-based; may be None if not in source")


class DiscussionQuestion(BaseModel):
    text: str


class Lesson(BaseModel):
    title: str
    author: Optional[str] = None
    grade_level: str = Field(description="Intended grade, e.g. 'Grade 7'")
    standard: str = Field(description="e.g. 'RI.7.2'")
    skill_focus: str
    knowledge_focus: str
    estimated_reading_level: str = Field(description="Estimated Lexile or grade level of the source text")
    vocabulary: list[VocabularyTerm]
    passage_text: str = Field(
        description="The full reading passage, with paragraph markers like [1], [2], [3] preserved at the start of each paragraph. Plain text. Do not use JSON escaping."
    )
    multiple_choice_questions: list[MultipleChoiceQuestion]
    short_response_prompt: str
    discussion_questions: list[DiscussionQuestion]


class ModificationType(str, Enum):
    leveled_text = "leveled_text"
    vocab_support = "vocab_support"
    graphic_organizer = "graphic_organizer"
    scaffolded_mc = "scaffolded_mc"
    sentence_stem_response = "sentence_stem_response"
    teacher_facilitation = "teacher_facilitation"


class Modification(BaseModel):
    id: str = Field(description="Stable id like 'mod-1', 'mod-2'")
    type: ModificationType
    title: str
    rationale: str = Field(description="Why this modification is needed for THIS student")
    iep_citations: list[Citation] = Field(
        description="At least one IEP quote that justifies this modification"
    )


class ModificationPlan(BaseModel):
    gap_analysis: str = Field(
        description="2-4 sentences: what does the lesson demand, what can the student do, what is the gap"
    )
    student_specific_summary: str = Field(
        description="1-2 sentences naming concrete IEP elements driving the plan"
    )
    modifications: list[Modification]


class VocabEntry(BaseModel):
    word: str
    kid_friendly_definition: str
    visual_cue: str = Field(description="A simple visual a teacher could sketch or show")
    example_sentence: str


class LeveledText(BaseModel):
    title: str
    passage: str = Field(description="The full rewritten passage, preserving the central idea")
    target_grade_level: float = Field(description="Target Flesch-Kincaid grade level we aimed for")
    preserved_central_idea: str = Field(description="The central idea, in one sentence, that must be preserved")
    notes_to_teacher: str
    modification_ids: list[str] = Field(default_factory=list)


class VocabCard(BaseModel):
    words: list[VocabEntry]
    modification_ids: list[str] = Field(default_factory=list)


class GraphicOrganizer(BaseModel):
    title: str
    organizer_type: str = Field(description="e.g. 'Central Idea + 3 Supporting Details'")
    structure_markdown: str = Field(description="A printable text/markdown representation of the organizer")
    sentence_stems: list[str] = Field(default_factory=list)
    modification_ids: list[str] = Field(default_factory=list)


class ScaffoldedMCQ(BaseModel):
    original_number: int
    original_stem: str
    modified_stem: str
    choices: list[str] = Field(description="Reduced and simplified, 2-3 options")
    correct_index: int
    why_others_are_wrong: list[str] = Field(default_factory=list)
    modification_ids: list[str] = Field(default_factory=list)


class SentenceStemResponse(BaseModel):
    original_prompt: str
    modified_prompt: str
    sentence_starters: list[str]
    success_criteria_kid_friendly: list[str]
    modification_ids: list[str] = Field(default_factory=list)


class FacilitationStep(BaseModel):
    when: str = Field(description="e.g. 'Before reading', 'After paragraph 4', 'On frustration cue'")
    teacher_action: str
    rationale_short: str


class TeacherGuide(BaseModel):
    pacing_chunks: list[FacilitationStep]
    behavioral_supports: list[FacilitationStep]
    grouping_recommendation: str
    praise_scripts: list[str]
    modification_ids: list[str] = Field(default_factory=list)


class GeneratedArtifacts(BaseModel):
    leveled_text: LeveledText
    vocab_card: VocabCard
    graphic_organizer: GraphicOrganizer
    scaffolded_mc: list[ScaffoldedMCQ]
    sentence_stem_response: SentenceStemResponse
    teacher_guide: TeacherGuide


class ReadabilityCheck(BaseModel):
    original_fk_grade: float
    modified_fk_grade: float
    target_grade: float
    target_met: bool


class VerificationReport(BaseModel):
    readability: ReadabilityCheck
    every_mod_has_citation: bool
    total_iep_citations: int
    central_idea_preserved: bool
    central_idea_judgment: str = Field(description="Short rationale for the central-idea call")
    warnings: list[str] = Field(default_factory=list)


class ModifyResponse(BaseModel):
    student: StudentProfile
    lesson: Lesson
    plan: ModificationPlan
    artifacts: GeneratedArtifacts
    verification: VerificationReport
    timings_ms: dict[str, int] = Field(default_factory=dict)
