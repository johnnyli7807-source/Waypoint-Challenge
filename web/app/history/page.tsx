"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface JobRow {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  progress_pct: number;
  progress_step: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  lesson_filename: string | null;
  iep_filename: string | null;
  student_name: string | null;
  student_grade: string | null;
  lesson_title: string | null;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function fmtAbs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const data = await r.json();
        if (!cancelled) setJobs(data.jobs ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="paper-texture min-h-screen pb-32">
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
            href="/"
            className="mono text-[11px] text-ink-muted tracking-wider uppercase hover:text-ink"
          >
            ← New packet
          </Link>
        </div>
      </header>

      <section className="px-8 sm:px-12 max-w-[1180px] mx-auto pt-14 sm:pt-20">
        <div className="eyebrow">Archive</div>
        <h1
          className="display-tight text-[52px] sm:text-[80px] mt-4 text-ink leading-[1.0]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          Every packet, <span className="serif italic text-accent">filed.</span>
        </h1>
        <p className="mt-6 max-w-[58ch] serif italic text-[18px] text-ink-soft leading-snug">
          Every run is saved to the database with its inputs, outputs, and
          telemetry. Re-open a packet without paying for a re-run.
        </p>

        {error && (
          <div className="mt-12 p-4 bg-alert-soft border-l-2 border-alert text-alert serif italic">
            {error}
          </div>
        )}

        {jobs === null && !error && (
          <div className="mt-16 serif italic text-ink-muted">Loading…</div>
        )}

        {jobs && jobs.length === 0 && (
          <div className="mt-16">
            <p className="serif italic text-[20px] text-ink-soft">
              The archive is empty.
            </p>
            <Link
              href="/"
              className="inline-block mt-6 mono text-[11px] tracking-wider uppercase text-accent hover:underline"
            >
              ← Generate the first packet
            </Link>
          </div>
        )}

        {jobs && jobs.length > 0 && (
          <div className="mt-16 border-t-2 border-ink">
            {jobs.map((j, i) => (
              <JobRowEntry key={j.id} job={j} index={i + 1} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatusPill({ s }: { s: JobRow["status"] }) {
  const map: Record<JobRow["status"], { label: string; cls: string }> = {
    queued: { label: "queued", cls: "bg-paper-deep text-ink-muted" },
    running: { label: "running", cls: "bg-accent-fade text-accent" },
    done: { label: "done", cls: "bg-positive-soft text-positive" },
    failed: { label: "failed", cls: "bg-alert-soft text-alert" },
  };
  const m = map[s];
  return (
    <span
      className={`inline-block mono text-[10px] tracking-wider uppercase px-2 py-0.5 rounded ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function JobRowEntry({ job, index }: { job: JobRow; index: number }) {
  const isClickable = job.status === "done";
  const Wrapper: React.ElementType = isClickable ? Link : "div";
  const wrapperProps = isClickable
    ? { href: `/result/${job.id}` }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "grid grid-cols-1 md:grid-cols-[60px_1fr_auto_120px_120px] gap-x-8 gap-y-2 py-7 border-b border-rule-soft items-baseline",
        isClickable ? "cursor-pointer hover:bg-paper-warm transition-colors -mx-4 px-4" : "opacity-80",
      ].join(" ")}
    >
      <span className="display-tight text-[28px] text-accent leading-none tabular-nums" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>
        {String(index).padStart(2, "0")}
      </span>

      <div>
        <h2
          className="display-tight text-[22px] sm:text-[26px] text-ink leading-[1.1]"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
        >
          {job.lesson_title ?? job.lesson_filename ?? "(untitled lesson)"}
        </h2>
        <div className="mt-2 serif italic text-[15px] text-ink-soft leading-snug">
          {job.student_name
            ? `For ${job.student_name}${job.student_grade ? ` · ${job.student_grade}` : ""}`
            : "—"}
        </div>
        {job.status !== "done" && job.progress_step && (
          <div className="mt-1 mono text-[11px] text-ink-muted">
            {job.progress_step} ({job.progress_pct}%)
          </div>
        )}
        {job.status === "failed" && job.error && (
          <div className="mt-1 mono text-[11px] text-alert truncate max-w-[60ch]">
            {job.error.split("\n")[0]}
          </div>
        )}
      </div>

      <StatusPill s={job.status} />

      <div className="mono text-[11px] text-ink-muted leading-relaxed">
        <div>{relTime(job.created_at)}</div>
        <div className="text-ink-muted/60 text-[10px]">{fmtAbs(job.created_at)}</div>
      </div>

      <div className="mono text-[11px] text-ink-muted text-right truncate">
        {job.id.slice(0, 12)}
      </div>
    </Wrapper>
  );
}
