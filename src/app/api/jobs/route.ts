import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { verifyTurnstileToken } from "@/lib/server/turnstile";
import { createLoveJobWithToken } from "@/lib/server/love-job-service";
import { getFirestoreBackendMode } from "@/lib/server/firestore-repo";
import { logEvent } from "@/lib/server/monitoring";
import type { LoveJobInput } from "@/lib/love-job-types";

function getIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"
  );
}

export async function POST(request: NextRequest) {
  const ip = getIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";
  const rate = consumeRateLimit(`create:${ip}`, 10, 60_000);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const body = (await request.json()) as {
      input?: LoveJobInput;
      captchaToken?: string;
    };

    if (!body.input) {
      return NextResponse.json({ error: "입력값이 필요해요." }, { status: 400 });
    }

    const captcha = await verifyTurnstileToken(body.captchaToken ?? null, ip);
    if (!captcha.success) {
      return NextResponse.json({ error: "캡차 검증에 실패했어요." }, { status: 400 });
    }

    const created = await createLoveJobWithToken({
      input: body.input,
      ip,
      ua,
    });

    logEvent("info", "job_created", {
      jobId: created.job.id,
      backendMode: getFirestoreBackendMode(),
      captchaSkipped: captcha.skipped,
    });

    return NextResponse.json({
      job: created.job,
      accessToken: created.accessToken,
      checkout: {
        provider: "toss",
        amount: created.job.payment.amount,
        orderId: created.job.payment.orderId,
      },
    });
  } catch (error) {
    logEvent("error", "job_create_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { error: "요청 생성 중 오류가 발생했어요. 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
