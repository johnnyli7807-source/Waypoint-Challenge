"use client";

import { useCallback, useRef, useState } from "react";

interface DropzoneProps {
  eyebrow: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
}

function bytesToHuman(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Dropzone({
  eyebrow,
  label,
  hint,
  file,
  onChange,
  accept = "application/pdf",
}: DropzoneProps) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setHover(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onChange(f);
    },
    [onChange],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onClick={() => ref.current?.click()}
      className={[
        "group relative cursor-pointer transition-colors duration-200",
        "border border-rule rounded-[2px] overflow-hidden",
        "px-7 pt-7 pb-8 min-h-[260px] flex flex-col",
        hover ? "bg-accent-fade border-accent" : "bg-paper-warm hover:bg-paper-deep/40",
        file ? "border-accent" : "",
      ].join(" ")}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      <div className="absolute top-3 right-3 mono text-[10px] text-ink-muted">
        {file ? "PDF · loaded" : "PDF"}
      </div>

      <div className="eyebrow">{eyebrow}</div>

      <div className="mt-4 flex-1 flex flex-col">
        {!file ? (
          <>
            <h3 className="display-tight text-[34px] text-ink mt-1 max-w-[14ch]">
              {label}
            </h3>
            <p className="mt-3 text-[13.5px] text-ink-muted leading-relaxed">
              {hint}
            </p>
            <div className="mt-auto flex items-end justify-between pt-6">
              <span className="text-[13px] text-ink-soft serif italic">
                drop or click
              </span>
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                fill="none"
                className={[
                  "text-ink-soft transition-transform duration-300",
                  hover ? "translate-y-1 text-accent" : "",
                ].join(" ")}
              >
                <path
                  d="M18 8v18m0 0l-7-7m7 7l7-7"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="square"
                />
              </svg>
            </div>
          </>
        ) : (
          <>
            <h3 className="display-tight text-[28px] text-ink mt-1 break-all">
              {file.name.replace(/\.pdf$/i, "")}
            </h3>
            <p className="mt-2 mono text-ink-muted">
              {bytesToHuman(file.size)} · pdf
            </p>
            <div className="mt-auto flex items-end justify-between pt-6">
              <span className="text-[13px] text-accent serif italic">
                received ✓
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="mono text-[11px] text-ink-muted hover:text-alert tracking-wider uppercase"
              >
                Replace
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
