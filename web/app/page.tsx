"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Dropzone from "./components/dropzone";

type Phase = "idle" | "submitting" | "error";

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export default function Home() {
  const router = useRouter();
  const [lesson, setLesson] = useState<File | null>(null);
  const [iep, setIep] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  useEffect(() => {
    fetch("/api/limits", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Quota) => setQuota(d))
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const limitReached = !!quota && quota.remaining <= 0;
  const ready = !!lesson && !!iep && phase === "idle" && !limitReached;

  async function onSubmit() {
    if (!lesson || !iep) return;
    setPhase("submitting");
    setError(null);

    const fd = new FormData();
    fd.append("lesson_pdf", lesson);
    fd.append("iep_pdf", iep);

    try {
      const res = await fetch("/api/modify", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error(
            body?.detail?.message ??
              "Demo limit reached. Contact the operator to raise the cap.",
          );
        }
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const { job_id } = await res.json();
      if (!job_id) throw new Error("Backend did not return a job_id");
      router.push(`/result/${job_id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="paper-texture min-h-screen">
      <header className="px-8 sm:px-12 pt-8 flex items-baseline justify-between max-w-[1280px] mx-auto">
        <div className="flex items-baseline gap-3">
          <span
            className="display-tight text-[26px] tracking-tight text-ink"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0' }}
          >
            Modulus
          </span>
          <span className="mono text-[11px] text-ink-muted hidden sm:inline">
            v0.1 · ed-tech R&amp;D
          </span>
        </div>
        <a
          href="/history"
          className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
        >
          History →
        </a>
      </header>

      <div className="max-w-[1100px] mx-auto px-8 sm:px-12 pb-24 pt-14 sm:pt-24">
        {phase === "submitting" ? (
          <div className="serif italic text-ink-muted text-[18px] mt-20">
            Sending the documents to the backend…
          </div>
        ) : (
          <>
            <section>
              <div className="eyebrow rise" style={{ animationDelay: "0.05s" }}>
                A take-home for special-education tools
              </div>
              <h1
                className="display-tight rise text-[58px] sm:text-[88px] md:text-[104px] mt-5 text-ink"
                style={{ animationDelay: "0.15s" }}
              >
                Plan a lesson <br />
                <span className="serif italic text-accent" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
                  worthy of every
                </span>{" "}
                student.
              </h1>
              <p
                className="serif italic text-[20px] sm:text-[22px] text-ink-soft mt-7 max-w-[58ch] leading-snug rise"
                style={{ animationDelay: "0.3s" }}
              >
                Upload a lesson and a student’s IEP. We return a modified
                lesson where every change is traceable, line by line, to the
                IEP.
              </p>
            </section>

            <hr className="hr-soft my-14 sm:my-20 rise" style={{ animationDelay: "0.4s" }} />

            <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rise" style={{ animationDelay: "0.45s" }}>
                <Dropzone
                  eyebrow="01 · The lesson"
                  label="Drop the lesson PDF"
                  hint="A teacher's lesson plan with the reading, the vocab, the questions, and the prompt. CommonLit-style works."
                  file={lesson}
                  onChange={setLesson}
                />
              </div>
              <div className="rise" style={{ animationDelay: "0.55s" }}>
                <Dropzone
                  eyebrow="02 · The IEP"
                  label="Drop the student's IEP"
                  hint="The full Individualized Education Program — present levels, goals, accommodations. Treat it as a legal document."
                  file={iep}
                  onChange={setIep}
                />
              </div>
            </section>

            <section className="mt-12 rise" style={{ animationDelay: "0.7s" }}>
              <button
                disabled={!ready}
                onClick={onSubmit}
                className={[
                  "group relative w-full md:w-auto inline-flex items-baseline gap-5",
                  "px-9 py-5 transition-all duration-300",
                  ready
                    ? "bg-ink text-paper-warm hover:bg-accent"
                    : "bg-paper-deep/60 text-ink-muted cursor-not-allowed",
                ].join(" ")}
              >
                <span
                  className="display-tight text-[24px] sm:text-[28px]"
                  style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
                >
                  Generate the modified lesson
                </span>
                <span className="mono text-[12px] tracking-wider uppercase opacity-70">
                  →
                </span>
              </button>
              <p className="mt-4 mono text-[11px] text-ink-muted tracking-wider uppercase">
                ≈ 3 minutes · 10 model calls · outputs trace to the IEP
              </p>

              {quota && (
                <div className="mt-6 max-w-[420px]">
                  <div className="flex items-baseline justify-between">
                    <span className="eyebrow">Demo quota</span>
                    <span className="mono text-[11px] text-ink-soft tabular-nums">
                      {quota.used}/{quota.limit} used · {quota.remaining} left
                    </span>
                  </div>
                  <div className="mt-2 h-[4px] bg-paper-deep relative overflow-hidden rounded-full">
                    <div
                      className={[
                        "absolute inset-y-0 left-0 transition-all duration-700",
                        limitReached ? "bg-alert" : "bg-accent",
                      ].join(" ")}
                      style={{ width: `${(quota.used / quota.limit) * 100}%` }}
                    />
                  </div>
                  {limitReached && (
                    <p className="mt-3 serif italic text-[14.5px] text-alert leading-snug">
                      Demo cap reached. This is a controlled-cost preview; new
                      runs are paused until the operator raises the limit.
                    </p>
                  )}
                </div>
              )}

              <p className="mt-5 mono text-[11px] text-ink-muted">
                or{" "}
                <a
                  href="/result/demo"
                  className="text-accent underline underline-offset-4 decoration-rule hover:decoration-accent"
                >
                  view a sample output
                </a>{" "}
                from a previous run
              </p>
              {error && (
                <div className="mt-6 p-4 bg-alert-soft border-l-2 border-alert serif italic text-alert text-[15px] max-w-[60ch]">
                  {error}
                </div>
              )}
            </section>

            <hr className="hr-soft my-20" />
            <footer className="grid grid-cols-1 md:grid-cols-3 gap-10 text-[13.5px] text-ink-soft">
              <div>
                <div className="eyebrow">A note on method</div>
                <p className="mt-3 leading-relaxed">
                  An IEP is a legal document. Modifications a teacher cannot
                  defend back to it are worse than none at all. So citations
                  here aren&apos;t flourish &mdash; they&apos;re a typed schema
                  field the planner cannot omit, rendered alongside every
                  artifact.
                </p>
              </div>
              <div>
                <div className="eyebrow">What you&apos;ll get back</div>
                <ul className="mt-3 space-y-1.5 leading-relaxed">
                  <li>· A leveled reading passage at grade 4</li>
                  <li>· Pre-teach vocabulary with visual cues</li>
                  <li>· A printable graphic organizer</li>
                  <li>· Scaffolded multiple-choice questions</li>
                  <li>· A sentence-stem short-response prompt</li>
                  <li>· A teacher facilitation guide</li>
                </ul>
              </div>
              <div>
                <div className="eyebrow">Verification</div>
                <p className="mt-3 leading-relaxed">
                  Three checks ship with every output: a Flesch&ndash;Kincaid
                  grade match on the leveled text, a citation completeness
                  pass, and an LLM judge call on central-idea preservation.
                </p>
              </div>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
