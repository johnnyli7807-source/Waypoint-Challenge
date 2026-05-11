/** GET /api/jobs — proxy to backend GET /jobs (history list). */
import { NextResponse } from "next/server";

const BACKEND_URL = process.env.MODULUS_BACKEND_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_URL}/jobs?limit=100`, {
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "backend unreachable" },
      { status: 502 },
    );
  }
}
