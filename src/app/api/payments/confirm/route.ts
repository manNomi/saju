import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { getAuthorizedLoveJob, markPaymentAsPaid, sanitizeLoveJob } from "@/lib/server/love-job-service";
import { logEvent } from "@/lib/server/monitoring";

function getIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"
  );
}

async function confirmWithToss(payload: { paymentKey: string; orderId: string; amount: number }) {
  const tossSecret = process.env.TOSS_SECRET_KEY;
  if (!tossSecret) {
    throw new Error("toss_secret_missing");
  }

  const basic = Buffer.from(`${tossSecret}:`).toString("base64");

  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? body.code ?? "payment_confirm_failed");
  }
}

export async function POST(request: NextRequest) {
  const ip = getIp(request);
  const rate = consumeRateLimit(`pay:${ip}`, 12, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "결제 확인 요청이 너무 많아요." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      jobId?: string;
      accessToken?: string;
      paymentKey?: string;
      orderId?: string;
      amount?: number;
    };

    if (!body.jobId || !body.accessToken || !body.orderId || typeof body.amount !== "number") {
      return NextResponse.json({ error: "결제 확인 파라미터가 부족해요." }, { status: 400 });
    }

    const job = await getAuthorizedLoveJob(body.jobId, body.accessToken);
    if (!job) {
      return NextResponse.json({ error: "요청 정보를 찾지 못했어요." }, { status: 404 });
    }

    if (job.payment.orderId !== body.orderId || job.payment.amount !== body.amount) {
      return NextResponse.json({ error: "주문 정보가 일치하지 않아요." }, { status: 400 });
    }

    if (job.paymentStatus === "paid") {
      return NextResponse.json({ job: sanitizeLoveJob(job) });
    }

    if (!process.env.TOSS_SECRET_KEY) {
      return NextResponse.json({ error: "결제 연동이 설정되지 않았어요." }, { status: 500 });
    }

    if (!body.paymentKey) {
      return NextResponse.json({ error: "paymentKey가 필요해요." }, { status: 400 });
    }

    await confirmWithToss({
      paymentKey: body.paymentKey,
      orderId: body.orderId,
      amount: body.amount,
    });

    const paymentKey = body.paymentKey.trim();
    const updated = await markPaymentAsPaid({
      jobId: body.jobId,
      accessToken: body.accessToken,
      paymentKey,
    });

    logEvent("info", "payment_confirmed", {
      jobId: body.jobId,
      mode: "toss",
    });

    return NextResponse.json({ job: updated });
  } catch (error) {
    logEvent("error", "payment_confirm_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ error: "결제 확인에 실패했어요." }, { status: 500 });
  }
}
