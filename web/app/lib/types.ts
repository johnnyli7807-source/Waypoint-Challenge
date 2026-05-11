// Mirrors app/schemas.py. Keep in sync.

export type CitationSource = "IEP" | "Lesson";

export interface Citation {
  source: CitationSource;
  section: string;
  quote: string;
}

export interface Accommodation {
  category: "presentation" | "response" | "timing" | "setting" | "other";
  text: string;
  source_quote: string;
}

export interface AnnualGoal {
  area: string;
  baseline: string;
  target: string;
  benchmarks: string[];
}

export interface StudentProfile {
  student_name: string;
  grade_level: string;
  disability: string;
  reading_level: string;
  math_level: string;
  present_levels_academic: string;
  present_levels_behavioral: string;
  strengths: string[];
  interests: string[];
  behavioral_patterns: string[];
  accommodations: Accommodation[];
  modifications: string[];
  annual_goals: AnnualGoal[];
  english_learner: boolean;
  requires_aac: boolean;
}

export interface VocabularyTerm {
  word: string;
  pronunciation?: string | null;
  definition?: string | null;
}

export interface MultipleChoiceQuestion {
  number: number;
  standard?: string | null;
  stem: string;
  choices: string[];
  correct_index?: number | null;
}

export interface DiscussionQuestion {
  text: string;
}

export interface Lesson {
  title: string;
  author?: string | null;
  grade_level: string;
  standard: string;
  skill_focus: string;
  knowledge_focus: string;
  estimated_reading_level: string;
  vocabulary: VocabularyTerm[];
  passage_text: string;
  multiple_choice_questions: MultipleChoiceQuestion[];
  short_response_prompt: string;
  discussion_questions: DiscussionQuestion[];
}

export type ModificationType =
  | "leveled_text"
  | "vocab_support"
  | "graphic_organizer"
  | "scaffolded_mc"
  | "sentence_stem_response"
  | "teacher_facilitation";

export interface Modification {
  id: string;
  type: ModificationType;
  title: string;
  rationale: string;
  iep_citations: Citation[];
}

export interface ModificationPlan {
  gap_analysis: string;
  student_specific_summary: string;
  modifications: Modification[];
}

export interface VocabEntry {
  word: string;
  kid_friendly_definition: string;
  visual_cue: string;
  example_sentence: string;
}

export interface LeveledText {
  title: string;
  passage: string;
  target_grade_level: number;
  preserved_central_idea: string;
  notes_to_teacher: string;
  modification_ids: string[];
}

export interface VocabCard {
  words: VocabEntry[];
  modification_ids: string[];
}

export interface GraphicOrganizer {
  title: string;
  organizer_type: string;
  structure_markdown: string;
  sentence_stems: string[];
  modification_ids: string[];
}

export interface ScaffoldedMCQ {
  original_number: number;
  original_stem: string;
  modified_stem: string;
  choices: string[];
  correct_index: number;
  why_others_are_wrong: string[];
  modification_ids: string[];
}

export interface SentenceStemResponse {
  original_prompt: string;
  modified_prompt: string;
  sentence_starters: string[];
  success_criteria_kid_friendly: string[];
  modification_ids: string[];
}

export interface FacilitationStep {
  when: string;
  teacher_action: string;
  rationale_short: string;
}

export interface TeacherGuide {
  pacing_chunks: FacilitationStep[];
  behavioral_supports: FacilitationStep[];
  grouping_recommendation: string;
  praise_scripts: string[];
  modification_ids: string[];
}

export interface GeneratedArtifacts {
  leveled_text: LeveledText;
  vocab_card: VocabCard;
  graphic_organizer: GraphicOrganizer;
  scaffolded_mc: ScaffoldedMCQ[];
  sentence_stem_response: SentenceStemResponse;
  teacher_guide: TeacherGuide;
}

export interface ReadabilityCheck {
  original_fk_grade: number;
  modified_fk_grade: number;
  target_grade: number;
  target_met: boolean;
}

export interface VerificationReport {
  readability: ReadabilityCheck;
  every_mod_has_citation: boolean;
  total_iep_citations: number;
  central_idea_preserved: boolean;
  central_idea_judgment: string;
  warnings: string[];
}

export interface ModifyResponse {
  student: StudentProfile;
  lesson: Lesson;
  plan: ModificationPlan;
  artifacts: GeneratedArtifacts;
  verification: VerificationReport;
  timings_ms: Record<string, number>;
}
