"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import type {
  Citation,
  Modification,
  ModificationType,
  ModifyResponse,
} from "../../lib/types";
import Markdown from "../../components/markdown";

interface JobStatus {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress_pct: number;
  progress_step: string | null;
  error: string | null;
  student_name: string | null;
  lesson_title: string | null;
  created_at: string;
}

const MOD_LABEL: Record<ModificationType, string> = {
  leveled_text: "Leveled passage",
  vocab_support: "Pre-teach vocabulary",
  graphic_organizer: "Graphic organizer",
  scaffolded_mc: "Scaffolded questions",
  sentence_stem_response: "Sentence-stem response",
  teacher_facilitation: "Teacher facilitation",
};

const ROMAN = ["I", "II", "III", "IV"];

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  const [data, setData] = useState<ModifyResponse | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    // Demo mode: load the pre-baked sample without hitting the backend.
    if (id === "demo") {
      fetch("/sample-result.json")
        .then((r) => r.json())
        .then((d) => {
          if (!cancelRef.current) setData(d);
        })
        .catch(() => router.replace("/"));
      return () => {
        cancelRef.current = true;
      };
    }

    if (!id) {
      router.replace("/");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (!r.ok) {
          if (r.status === 404) {
            setError("Job not found.");
            return;
          }
          throw new Error(`status ${r.status}`);
        }
        const j: JobStatus = await r.json();
        if (cancelRef.current) return;
        setJob(j);

        if (j.status === "done") {
          const rr = await fetch(`/api/jobs/${id}/result`, { cache: "no-store" });
          if (!rr.ok) throw new Error(`result fetch ${rr.status}`);
          const d = await rr.json();
          if (!cancelRef.current) setData(d);
          return;
        }
        if (j.status === "failed") {
          setError(j.error ?? "Pipeline failed.");
          return;
        }
        // queued or running — poll again
        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!cancelRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    poll();
    return () => {
      cancelRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router]);

  if (error) {
    return (
      <main className="paper-texture min-h-screen grid place-items-center px-8">
        <div className="max-w-[60ch]">
          <div className="eyebrow text-alert">Something went wrong</div>
          <h1 className="display-tight text-[40px] mt-3 text-ink leading-[1.05]">
            We couldn&apos;t finish that run.
          </h1>
          <pre className="mt-6 mono text-[12px] text-ink-soft whitespace-pre-wrap bg-paper-warm border border-rule p-4 max-h-[300px] overflow-auto">
            {error}
          </pre>
          <Link
            href="/"
            className="inline-block mt-8 mono text-[11px] tracking-wider uppercase text-accent hover:underline"
          >
            ← Try again
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return <PreparingView job={job} />;
  }

  const r = data;
  const firstName = r.student.student_name.split(" ")[0];

  return (
    <main className="paper-texture min-h-screen pb-32">
      {/* MASTHEAD */}
      <header className="px-8 sm:px-12 pt-8 max-w-[1180px] mx-auto no-print">
        <div className="flex items-baseline justify-between">
          <Link
            href="/"
            className="display-tight text-[24px] tracking-tight text-ink hover:text-accent transition-colors"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0' }}
          >
            Modulus
          </Link>
          <div className="flex items-baseline gap-6">
            <button
              onClick={() => window.print()}
              className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
            >
              Print packet
            </button>
            <Link
              href="/"
              className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
            >
              ← Start over
            </Link>
          </div>
        </div>
      </header>

      {/* TITLE BLOCK */}
      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto pt-14 sm:pt-20">
        <div className="eyebrow">A modified-lesson packet · prepared by Modulus</div>
        <h1
          className="display-tight text-[44px] sm:text-[68px] md:text-[84px] mt-4 text-ink leading-[1.0]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          {r.lesson.title}
        </h1>
        <div className="mt-7 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-12 gap-y-2 max-w-[64ch]">
          <div className="eyebrow">Prepared for</div>
          <div className="serif text-[18px] text-ink-soft">
            {r.student.student_name} · {r.student.grade_level} · disability:{" "}
            {r.student.disability.toLowerCase()} · reading at{" "}
            {r.student.reading_level}
          </div>
          <div className="eyebrow">Lesson skill</div>
          <div className="serif text-[18px] text-ink-soft">
            {r.lesson.standard} — {r.lesson.skill_focus}
          </div>
        </div>

        {/* VERIFICATION BAND */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-px bg-rule-soft border border-rule-soft">
          <Badge
            label="Readability"
            value={`FK ${r.verification.readability.original_fk_grade.toFixed(1)} → ${r.verification.readability.modified_fk_grade.toFixed(1)}`}
            sub={`target ≤ ${(r.verification.readability.target_grade + 1).toFixed(1)}`}
            ok={r.verification.readability.target_met}
          />
          <Badge
            label="Citations"
            value={`${r.verification.total_iep_citations} verbatim quotes`}
            sub={`across ${r.plan.modifications.length} modifications`}
            ok={r.verification.every_mod_has_citation}
          />
          <Badge
            label="Central idea"
            value={r.verification.central_idea_preserved ? "Preserved" : "Drift"}
            sub="judged against the original"
            ok={r.verification.central_idea_preserved}
          />
        </div>
        {r.verification.warnings.length > 0 && (
          <div className="mt-5 p-4 bg-alert-soft border-l-2 border-alert text-alert">
            <div className="eyebrow text-alert">Review notes</div>
            <ul className="mt-2 serif italic text-[15px] space-y-1">
              {r.verification.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Divider numeral={ROMAN[0]} title="Why these modifications" />

      {/* PLAN */}
      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-10">
          <div>
            <div className="eyebrow">Gap analysis</div>
            <p className="mt-3 serif text-[19px] text-ink-soft italic leading-snug">
              {r.plan.gap_analysis}
            </p>
          </div>
          <div>
            <div className="eyebrow">Driven by this student&apos;s IEP</div>
            <p className="mt-3 serif dropcap text-[18px] text-ink leading-relaxed">
              {r.plan.student_specific_summary}
            </p>
          </div>
        </div>

        <div className="mt-16 space-y-12">
          {r.plan.modifications.map((m, i) => (
            <ModificationBlock key={m.id} mod={m} index={i + 1} />
          ))}
        </div>
      </section>

      <Divider numeral={ROMAN[1]} title="What the student gets" />

      {/* STUDENT-FACING MATERIALS */}
      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto space-y-20">
        <LeveledPassage data={r} firstName={firstName} />
        <VocabSection data={r} />
        <OrganizerSection data={r} />
        <ScaffoldedMCSection data={r} firstName={firstName} />
        <ShortResponseSection data={r} firstName={firstName} />
      </section>

      <Divider numeral={ROMAN[2]} title="What the teacher does" />

      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto">
        <TeacherGuideSection data={r} />
      </section>

      <Divider numeral={ROMAN[3]} title="Diagnostics" />

      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto no-print">
        <Diagnostics data={r} />
      </section>

      <footer className="mt-32 max-w-[1180px] mx-auto px-8 sm:px-12">
        <hr className="hr-soft" />
        <div className="mt-6 mono text-[11px] text-ink-muted tracking-wider uppercase">
          End of packet · Modulus v0.1 · all citations sourced verbatim from
          the IEP
        </div>
      </footer>
    </main>
  );
}

function Badge({
  label,
  value,
  sub,
  ok,
}: {
  label: string;
  value: string;
  sub: string;
  ok: boolean;
}) {
  return (
    <div className={`p-5 ${ok ? "bg-paper-warm" : "bg-alert-soft"}`}>
      <div className="flex items-baseline gap-2">
        <span
          className={`mono text-[10px] tracking-wider ${ok ? "text-positive" : "text-alert"}`}
        >
          {ok ? "✓ PASS" : "△ REVIEW"}
        </span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-2 display-tight text-[22px] text-ink">{value}</div>
      <div className="mt-1 mono text-[11px] text-ink-muted">{sub}</div>
    </div>
  );
}

function Divider({ numeral, title }: { numeral: string; title: string }) {
  return (
    <div className="px-8 sm:px-12 max-w-[1180px] mx-auto mt-28 mb-14">
      <div className="grid grid-cols-[auto_1fr] items-end gap-8 border-b border-ink pb-3">
        <div
          className="display-tight text-[68px] text-accent leading-[0.8]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
        >
          {numeral}
        </div>
        <h2
          className="display-tight text-[28px] sm:text-[36px] text-ink leading-[1.0] pb-2"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          {title}
        </h2>
      </div>
    </div>
  );
}

function ModificationBlock({ mod, index }: { mod: Modification; index: number }) {
  return (
    <article className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-10 pt-8 border-t border-rule-soft">
      <div>
        <div className="eyebrow">
          {String(index).padStart(2, "0")} · {MOD_LABEL[mod.type]}
        </div>
        <h3
          className="display-tight text-[26px] sm:text-[32px] mt-3 text-ink leading-[1.05]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
        >
          {mod.title}
        </h3>
        <p className="mt-4 serif text-[16.5px] text-ink-soft leading-relaxed">
          {mod.rationale}
        </p>
      </div>

      <div className="space-y-5">
        <div className="eyebrow">From the IEP</div>
        {mod.iep_citations.map((c, i) => (
          <CitationQuote key={i} c={c} />
        ))}
      </div>
    </article>
  );
}

function CitationQuote({ c }: { c: Citation }) {
  return (
    <figure>
      <blockquote className="pullquote">{c.quote}</blockquote>
      <figcaption className="mt-2 ml-6 mono text-[11px] text-ink-muted tracking-wider uppercase">
        — {c.source} · {c.section}
      </figcaption>
    </figure>
  );
}

function LeveledPassage({
  data,
  firstName,
}: {
  data: ModifyResponse;
  firstName: string;
}) {
  const original = data.lesson.passage_text;
  const modified = data.artifacts.leveled_text.passage;

  return (
    <div>
      <div className="eyebrow">A · The reading</div>
      <h3
        className="display-tight text-[32px] sm:text-[40px] mt-2 text-ink leading-[1.05]"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
      >
        {data.artifacts.leveled_text.title}
      </h3>
      <Markdown
        className="mt-3 serif italic text-[16px] text-ink-muted max-w-[64ch] block leading-relaxed"
        text={data.artifacts.leveled_text.notes_to_teacher}
      />

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2">
        <div className="eyebrow">Original · {data.lesson.grade_level}</div>
        <div className="eyebrow text-accent">
          For {firstName} · FK {data.verification.readability.modified_fk_grade.toFixed(1)}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-10">
        <Passage text={original} muted />
        <Passage text={modified} />
      </div>
    </div>
  );
}

function Passage({ text, muted = false }: { text: string; muted?: boolean }) {
  // Render markdown bold (**word**) and split paragraphs on blank lines.
  const paras = text.split(/\n\s*\n/);
  return (
    <div
      className={`serif text-[16px] leading-[1.7] ${muted ? "text-ink-muted" : "text-ink"} space-y-4 pt-3 border-t border-rule-soft`}
    >
      {paras.map((p, i) => (
        <p
          key={i}
          dangerouslySetInnerHTML={{
            __html: p
              .replace(/\*\*(.+?)\*\*/g, '<strong class="display-tight text-ink not-italic" style="font-variation-settings: \'opsz\' 14, \'SOFT\' 50;">$1</strong>')
              .replace(/\n/g, "<br/>"),
          }}
        />
      ))}
    </div>
  );
}

function VocabSection({ data }: { data: ModifyResponse }) {
  return (
    <div>
      <div className="eyebrow">B · Pre-teach vocabulary</div>
      <h3
        className="display-tight text-[32px] sm:text-[40px] mt-2 text-ink leading-[1.05]"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
      >
        Words to teach before the reading
      </h3>
      <p className="mt-3 serif italic text-[16px] text-ink-muted max-w-[64ch]">
        Each word with a kid-friendly definition, a visual cue a teacher can
        sketch, and an example sentence in classroom context.
      </p>

      <div className="mt-8 border-t-2 border-ink">
        {data.artifacts.vocab_card.words.map((w, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr] gap-x-8 py-5 border-b border-rule-soft"
          >
            <div>
              <div
                className="display-tight text-[26px] text-ink leading-tight"
                style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100' }}
              >
                {w.word}
              </div>
            </div>
            <div className="serif text-[16px] text-ink leading-snug">
              {w.kid_friendly_definition}
              <div className="mt-2 serif italic text-[14.5px] text-ink-soft">
                e.g. {w.example_sentence}
              </div>
            </div>
            <div className="mono text-[12px] text-ink-soft leading-relaxed">
              <span className="eyebrow text-ink-muted">Visual cue</span>
              <div className="mt-1.5 serif text-[15px] not-italic text-ink-soft">
                {w.visual_cue}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganizerSection({ data }: { data: ModifyResponse }) {
  const o = data.artifacts.graphic_organizer;
  return (
    <div>
      <div className="eyebrow">C · Graphic organizer</div>
      <h3
        className="display-tight text-[32px] sm:text-[40px] mt-2 text-ink leading-[1.05]"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
      >
        {o.organizer_type}
      </h3>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
        <pre className="bg-paper-warm border border-rule p-6 mono text-[13px] leading-[1.55] overflow-auto whitespace-pre">
          {o.structure_markdown}
        </pre>
        <div>
          <div className="eyebrow">Sentence stems</div>
          <ul className="mt-3 space-y-2.5 serif text-[15.5px] text-ink-soft italic leading-snug">
            {o.sentence_stems.map((s, i) => (
              <li key={i} className="border-l-2 border-accent pl-4">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ScaffoldedMCSection({
  data,
  firstName,
}: {
  data: ModifyResponse;
  firstName: string;
}) {
  return (
    <div>
      <div className="eyebrow">D · Scaffolded multiple-choice</div>
      <h3
        className="display-tight text-[32px] sm:text-[40px] mt-2 text-ink leading-[1.05]"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
      >
        Same questions, simpler stems, fewer choices
      </h3>

      <div className="mt-8 space-y-12">
        {data.artifacts.scaffolded_mc.map((q, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 border-t border-rule-soft">
            <div>
              <div className="eyebrow">Original Q{q.original_number}</div>
              <p className="mt-3 serif text-[16.5px] text-ink-muted leading-snug">
                {q.original_stem}
              </p>
            </div>
            <div>
              <div className="eyebrow text-accent">For {firstName}</div>
              <p className="mt-3 serif text-[16.5px] text-ink leading-snug">
                {q.modified_stem}
              </p>
              <ol className="mt-4 space-y-2">
                {q.choices.map((c, j) => {
                  const correct = j === q.correct_index;
                  return (
                    <li
                      key={j}
                      className={[
                        "flex items-baseline gap-3 py-2 px-3",
                        correct ? "bg-positive-soft" : "bg-paper-warm",
                      ].join(" ")}
                    >
                      <span className="mono text-[11px] text-ink-muted uppercase tracking-wider">
                        {String.fromCharCode(65 + j)}
                      </span>
                      <span
                        className={[
                          "serif text-[15.5px] flex-1",
                          correct ? "text-positive font-medium" : "text-ink-soft",
                        ].join(" ")}
                      >
                        {c}
                      </span>
                      {correct && (
                        <span className="mono text-[10px] text-positive tracking-wider uppercase">
                          ✓ correct
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {q.why_others_are_wrong.length > 0 && (
                <div className="mt-4 mono text-[11px] text-ink-muted leading-relaxed">
                  {q.why_others_are_wrong.map((w, j) => (
                    <div key={j}>· {w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShortResponseSection({
  data,
  firstName,
}: {
  data: ModifyResponse;
  firstName: string;
}) {
  const s = data.artifacts.sentence_stem_response;
  return (
    <div>
      <div className="eyebrow">E · Short-response prompt (scaffolded)</div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <div className="eyebrow">Original prompt</div>
          <p className="mt-3 serif text-[16.5px] text-ink-muted leading-snug">
            {s.original_prompt}
          </p>
        </div>
        <div>
          <div className="eyebrow text-accent">For {firstName}</div>
          <p className="mt-3 serif text-[16.5px] text-ink leading-snug">
            {s.modified_prompt}
          </p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-12">
        <div>
          <div className="eyebrow">Sentence starters</div>
          <ol className="mt-3 space-y-3 serif text-[16px] text-ink-soft italic leading-snug">
            {s.sentence_starters.map((st, i) => (
              <li key={i} className="border-l-2 border-accent pl-4">
                {st}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="eyebrow">I&apos;ll know I&apos;m done when…</div>
          <ul className="mt-3 space-y-2 serif text-[15.5px] text-ink leading-snug">
            {s.success_criteria_kid_friendly.map((c, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span className="mono text-[10px] text-ink-muted">☐</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TeacherGuideSection({ data }: { data: ModifyResponse }) {
  const g = data.artifacts.teacher_guide;
  return (
    <div className="space-y-16">
      <div>
        <div className="eyebrow">A · Pacing</div>
        <h3
          className="display-tight text-[28px] sm:text-[34px] mt-2 text-ink leading-[1.05]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
        >
          The 45-minute walk-through
        </h3>
        <div className="mt-6 border-t-2 border-ink">
          {g.pacing_chunks.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-1 md:grid-cols-[200px_1fr_1fr] gap-x-8 py-5 border-b border-rule-soft"
            >
              <div className="display-tight text-[18px] text-accent leading-tight" style={{ fontVariationSettings: '"opsz" 36, "SOFT" 100' }}>
                {s.when}
              </div>
              <div className="serif text-[16px] text-ink leading-relaxed">
                {s.teacher_action}
              </div>
              <div className="mono text-[11.5px] text-ink-muted leading-relaxed">
                {s.rationale_short}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow">B · Behavior cues</div>
        <h3
          className="display-tight text-[28px] sm:text-[34px] mt-2 text-ink leading-[1.05]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
        >
          When &mdash; then.
        </h3>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {g.behavioral_supports.map((s, i) => (
            <div key={i} className="bg-paper-warm border-l-2 border-accent p-5">
              <div className="eyebrow text-accent">When</div>
              <div className="serif text-[15.5px] text-ink mt-1">{s.when}</div>
              <div className="eyebrow mt-4">Then</div>
              <div className="serif text-[15.5px] text-ink-soft mt-1">{s.teacher_action}</div>
              <div className="mt-3 mono text-[11px] text-ink-muted">{s.rationale_short}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <div className="eyebrow">C · Grouping</div>
          <p className="mt-3 serif text-[17px] italic text-ink-soft leading-relaxed max-w-[48ch]">
            {g.grouping_recommendation}
          </p>
        </div>
        <div>
          <div className="eyebrow">D · Praise scripts</div>
          <ul className="mt-3 space-y-3">
            {g.praise_scripts.map((p, i) => (
              <li key={i} className="serif italic text-[16px] text-ink-soft leading-snug">
                &ldquo;{p}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Diagnostics({ data }: { data: ModifyResponse }) {
  const [open, setOpen] = useState(false);
  const t = data.timings_ms;
  const cacheRead = t._tokens_cache_read ?? 0;
  const cacheWrite = t._tokens_cache_creation ?? 0;
  const inputUncached = t._tokens_input ?? 0;
  const output = t._tokens_output ?? 0;
  const totalMs = Object.entries(t)
    .filter(([k]) => !k.startsWith("_"))
    .reduce((sum, [, v]) => sum + (v as number), 0);

  return (
    <div>
      <button
        onClick={() => setOpen((x) => !x)}
        className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
      >
        {open ? "− Hide pipeline diagnostics" : "+ Show pipeline diagnostics"}
      </button>

      {open && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-12 fade">
          <div>
            <div className="eyebrow">Step timings</div>
            <table className="mt-3 w-full text-[12px] mono">
              <tbody>
                {Object.entries(t)
                  .filter(([k]) => !k.startsWith("_"))
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-rule-soft">
                      <td className="py-1.5 text-ink-soft">{k}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink">
                        {(v / 1000).toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                <tr className="font-medium">
                  <td className="py-1.5 text-ink">total wall-clock (sequential)</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">
                    {(totalMs / 1000).toFixed(1)}s
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="eyebrow">Token usage</div>
            <table className="mt-3 w-full text-[12px] mono">
              <tbody>
                <tr className="border-b border-rule-soft">
                  <td className="py-1.5 text-ink-soft">cache_creation</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{cacheWrite.toLocaleString()}</td>
                </tr>
                <tr className="border-b border-rule-soft">
                  <td className="py-1.5 text-positive">cache_read (saved)</td>
                  <td className="py-1.5 text-right tabular-nums text-positive">{cacheRead.toLocaleString()}</td>
                </tr>
                <tr className="border-b border-rule-soft">
                  <td className="py-1.5 text-ink-soft">input (uncached)</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{inputUncached.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-ink-soft">output</td>
                  <td className="py-1.5 text-right tabular-nums text-ink">{output.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 serif italic text-[14px] text-ink-muted leading-relaxed">
              The lesson and IEP are passed as cached system blocks. Cache
              reads from the second call onward — about{" "}
              {Math.round((cacheRead / (cacheRead + inputUncached || 1)) * 100)}% of input tokens free.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const PIPELINE_STEPS: { threshold: number; label: string; detail: string }[] = [
  { threshold: 0,  label: "Queued",                detail: "your job is in line" },
  { threshold: 5,  label: "Reading the documents", detail: "lesson + IEP parsed" },
  { threshold: 10, label: "Reading the IEP",       detail: "extracting goals, accommodations, present levels" },
  { threshold: 15, label: "Mapping the lesson",    detail: "passage, vocabulary, questions, prompts" },
  { threshold: 38, label: "Planning modifications",detail: "gap analysis · matching IEP citations" },
  { threshold: 70, label: "Generating artifacts",  detail: "leveled passage · vocabulary · organizer · MC · response · teacher guide" },
  { threshold: 96, label: "Verifying",             detail: "readability · citations · central idea preservation" },
  { threshold: 100,label: "Complete",              detail: "rendering the report" },
];

function pickStep(pct: number): number {
  let idx = 0;
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    if (pct >= PIPELINE_STEPS[i].threshold) idx = i;
  }
  return idx;
}

function PreparingView({ job }: { job: JobStatus | null }) {
  const pct = job?.progress_pct ?? 0;
  const stepLabel = job?.progress_step ?? "queued";
  const activeIdx = pickStep(pct);

  return (
    <main className="paper-texture min-h-screen">
      <header className="px-8 sm:px-12 pt-8 max-w-[1180px] mx-auto">
        <div className="flex items-baseline justify-between">
          <Link
            href="/"
            className="display-tight text-[24px] tracking-tight text-ink hover:text-accent transition-colors"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0' }}
          >
            Modulus
          </Link>
          <Link
            href="/history"
            className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
          >
            History →
          </Link>
        </div>
      </header>

      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto pt-20 sm:pt-28 pb-32">
        <div className="eyebrow">Working</div>
        <h1
          className="display-tight text-[52px] sm:text-[72px] mt-3 text-ink leading-[0.98]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          Reading <span className="serif italic text-accent">carefully.</span>
        </h1>
        <p className="mt-5 max-w-[58ch] serif italic text-[18px] text-ink-soft leading-snug">
          Ten LLM calls run as a single pipeline. The two source documents
          are cached so they aren't re-read at each step.
          This usually takes about three minutes — please stay on the page.
        </p>

        {/* PROGRESS BAR */}
        <div className="mt-12 max-w-[680px]">
          <div className="flex items-baseline justify-between">
            <div
              className="display-tight text-[68px] text-ink leading-none tabular-nums"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0' }}
            >
              {String(pct).padStart(2, "0")}
              <span className="text-ink-muted text-[36px] align-baseline ml-2">%</span>
            </div>
            <div className="mono text-[11px] text-ink-muted tracking-wider uppercase">
              {job?.status ?? "queued"}
            </div>
          </div>

          <div className="mt-4 h-[6px] bg-paper-deep relative overflow-hidden rounded-full">
            <div
              className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 mono text-[11.5px] text-ink-soft">
            {stepLabel}
          </div>
        </div>

        {/* STEP LIST */}
        <ol className="mt-14 space-y-5 max-w-[60ch]">
          {PIPELINE_STEPS.slice(0, -1).map((s, i) => {
            const state =
              i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
            return (
              <li
                key={s.label}
                className="grid grid-cols-[24px_1fr] gap-4 items-baseline"
              >
                <span
                  className={[
                    "mono text-[12px] tabular-nums",
                    state === "done"
                      ? "text-accent"
                      : state === "active"
                        ? "text-ink"
                        : "text-ink-muted/40",
                  ].join(" ")}
                >
                  {state === "done"
                    ? "✓"
                    : String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className={[
                    "transition-opacity duration-500",
                    state === "pending" ? "opacity-30" : "opacity-100",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "serif text-[18px]",
                      state === "active"
                        ? "text-ink"
                        : state === "done"
                          ? "text-ink-soft line-through decoration-rule decoration-1"
                          : "text-ink-soft",
                    ].join(" ")}
                  >
                    {s.label}
                    {state === "active" && (
                      <span className="ml-2 inline-block animate-pulse text-accent">·</span>
                    )}
                  </div>
                  <div className="mt-0.5 mono text-[11px] text-ink-muted">
                    {s.detail}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-16 mono text-[10.5px] text-ink-muted tracking-wider uppercase">
          Job ID: {job?.id ?? "—"}
        </p>
      </section>
    </main>
  );
}
