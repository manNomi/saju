import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/server/monitoring";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      event?: string;
      jobId?: string;
      detail?: Record<string, unknown>;
    };

    if (!body.event) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    logEvent("info", `client_${body.event}`, {
      jobId: body.jobId,
      detail: body.detail,
      ua: request.headers.get("user-agent") ?? "unknown",
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
