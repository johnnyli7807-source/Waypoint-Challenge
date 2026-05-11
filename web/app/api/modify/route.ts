// POST /api/modify -> backend POST /modify (returns {job_id} immediately).
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.MODULUS_BACKEND_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const incoming = await req.formData();
  const lesson = incoming.get("lesson_pdf");
  const iep = incoming.get("iep_pdf");

  if (!(lesson instanceof File) || !(iep instanceof File)) {
    return NextResponse.json(
      { error: "Both lesson_pdf and iep_pdf are required (PDF files)." },
      { status: 400 },
    );
  }

  const out = new FormData();
  out.append("lesson_pdf", lesson, lesson.name);
  out.append("iep_pdf", iep, iep.name);

  try {
    const upstream = await fetch(`${BACKEND_URL}/modify`, {
      method: "POST",
      body: out,
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Failed to reach backend at ${BACKEND_URL}: ${err.message}`
            : "Unknown backend error",
      },
      { status: 502 },
    );
  }
}
