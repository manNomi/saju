import type { LoveJobResult } from "@/lib/love-job-types";
import { createHash } from "node:crypto";

type EmailSendPayload = {
  to: string;
  name: string;
  requestId: string;
  result: LoveJobResult;
};

type EmailSendResult = {
  provider: "resend" | "console";
  messageId: string | null;
};

function toAsciiIdempotencyKey(prefix: string, raw: string) {
  const digest = createHash("sha256").update(raw).digest("hex");
  return `${prefix}-${digest.slice(0, 40)}`;
}

function createEmailHtml(payload: EmailSendPayload) {
  const detailedSections = payload.result.detailedSections ?? [];
  const sectionHtml =
    detailedSections.length > 0
      ? detailedSections
          .map(
            (section) =>
              `<h3 style="margin:16px 0 6px;font-size:15px;">${section.title}</h3><p style="margin:0 0 10px;">${section.body}</p>`,
          )
          .join("")
      : "";

  const yearGuide = payload.result.yearlyGuidance ?? [];
  const yearGuideHtml =
    yearGuide.length > 0
      ? `<h3 style="margin:16px 0 6px;font-size:15px;">연도별 가이드</h3><ul style="margin:0;padding-left:18px;">${yearGuide
          .map(
            (row) =>
              `<li style="margin:0 0 6px;">${row.year}년 · 기대 ${Math.round(row.loveChance * 100)}% · 리스크 ${Math.round(row.breakupRisk * 100)}% · ${row.focus}</li>`,
          )
          .join("")}</ul>`
      : "";

  return `
  <div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height: 1.55; color: #111827;">
    <h2 style="margin:0 0 12px;">${payload.name || "고객"}님의 연애운 분석 결과</h2>
    <p style="margin:0 0 10px;">요청 ID: <b>${payload.requestId}</b></p>
    <p style="margin:0 0 10px;">핵심 요약: ${payload.result.summary}</p>
    <p style="margin:0 0 10px;">좋은 흐름: ${payload.result.highlight}</p>
    <p style="margin:0 0 10px;">주의 포인트: ${payload.result.caution}</p>
    <p style="margin:0 0 10px;">타이밍 힌트: ${payload.result.timingHint}</p>
    ${sectionHtml}
    ${yearGuideHtml}
    <hr style="margin:18px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;color:#6b7280;font-size:12px;">본 결과는 참고용 콘텐츠입니다.</p>
  </div>`;
}

function createEmailText(payload: EmailSendPayload) {
  const detailedSections = payload.result.detailedSections ?? [];
  const sectionText =
    detailedSections.length > 0
      ? `\n\n${detailedSections.map((section) => `${section.title}\n${section.body}`).join("\n\n")}`
      : "";

  const yearGuide = payload.result.yearlyGuidance ?? [];
  const yearGuideText =
    yearGuide.length > 0
      ? `\n\n연도별 가이드\n${yearGuide
          .map(
            (row) =>
              `- ${row.year}년 · 기대 ${Math.round(row.loveChance * 100)}% · 리스크 ${Math.round(row.breakupRisk * 100)}% · ${row.focus}`,
          )
          .join("\n")}`
      : "";

  return [
    `${payload.name || "고객"}님의 연애운 분석 결과`,
    `요청 ID: ${payload.requestId}`,
    `핵심 요약: ${payload.result.summary}`,
    `좋은 흐름: ${payload.result.highlight}`,
    `주의 포인트: ${payload.result.caution}`,
    `타이밍 힌트: ${payload.result.timingHint}`,
    sectionText,
    yearGuideText,
    "",
    "본 결과는 참고용 콘텐츠입니다.",
  ].join("\n");
}

async function sendWithResend(payload: EmailSendPayload): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("resend_not_configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": toAsciiIdempotencyKey("love-job", payload.requestId),
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: "[사주 결과] 요청하신 연애운 리포트가 도착했습니다",
      text: createEmailText(payload),
      html: createEmailHtml(payload),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "resend_send_failed");
  }

  return {
    provider: "resend",
    messageId: body.id ?? null,
  };
}

export async function sendLoveResultEmail(payload: EmailSendPayload): Promise<EmailSendResult> {
  const mode = process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? "resend" : "console");

  if (mode === "resend") {
    return sendWithResend(payload);
  }

  // Console mode for local/dev tests.
  console.info(
    JSON.stringify({
      level: "info",
      event: "email_console_preview",
      to: payload.to,
      requestId: payload.requestId,
      summary: payload.result.summary,
    }),
  );

  return {
    provider: "console",
    messageId: null,
  };
}
