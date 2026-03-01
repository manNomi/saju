import { NextRequest, NextResponse } from "next/server";
import { processLoveJobsBatch } from "@/lib/server/love-job-service";
import { logEvent } from "@/lib/server/monitoring";

export async function POST(request: NextRequest) {
  const expected = process.env.JOB_PROCESSOR_SECRET?.trim();
  const incoming = request.headers.get("x-job-processor-secret")?.trim();

  // Allow client-triggered processing when no cron secret is configured.
  if (expected && incoming !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const processed = await processLoveJobsBatch(20);
    logEvent("info", "job_batch_processed", { processed });

    return NextResponse.json({ processed });
  } catch (error) {
    logEvent("error", "job_batch_process_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ error: "batch_process_failed" }, { status: 500 });
  }
}
