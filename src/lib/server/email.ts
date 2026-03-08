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

type AdminSummaryPayload = {
  requestId: string;
  requesterName: string;
  requesterEmail: string;
  status: "completed" | "failed";
  error: string | null;
  source: "api" | "worker";
  result: LoveJobResult | null;
};

const ADMIN_NOTIFY_EMAIL = "hanmw110@naver.com";

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

function createAdminSummaryText(payload: AdminSummaryPayload) {
  const statusLabel = payload.status === "completed" ? "성공" : "실패";
  const scoreText = payload.result
    ? `연애 ${payload.result.loveScore} / 결혼 ${payload.result.marriageScore} / 리스크 ${payload.result.riskScore}`
    : "점수 없음";

  return [
    `[관리자 요약] 사주 처리 ${statusLabel}`,
    `요청 ID: ${payload.requestId}`,
    `이름: ${payload.requesterName || "(미입력)"}`,
    `신청 이메일: ${payload.requesterEmail || "(없음)"}`,
    `결과 상태: ${statusLabel}`,
    `처리 경로: ${payload.source}`,
    `점수: ${scoreText}`,
    `오류: ${payload.error ?? "없음"}`,
    `모델 버전: ${payload.result?.modelVersion ?? "-"}`,
  ].join("\n");
}

function createAdminSummaryHtml(payload: AdminSummaryPayload) {
  const statusLabel = payload.status === "completed" ? "성공" : "실패";
  const statusColor = payload.status === "completed" ? "#027a48" : "#b42318";
  const scores = payload.result
    ? `${payload.result.loveScore} / ${payload.result.marriageScore} / ${payload.result.riskScore}`
    : "-";

  return `
  <div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height: 1.55; color: #111827;">
    <h2 style="margin:0 0 12px;">[관리자 요약] 사주 처리 ${statusLabel}</h2>
    <p style="margin:0 0 8px;">요청 ID: <b>${payload.requestId}</b></p>
    <p style="margin:0 0 8px;">이름: <b>${payload.requesterName || "(미입력)"}</b></p>
    <p style="margin:0 0 8px;">신청 이메일: <b>${payload.requesterEmail || "(없음)"}</b></p>
    <p style="margin:0 0 8px;">처리 경로: <b>${payload.source}</b></p>
    <p style="margin:0 0 8px;">결과 상태: <b style="color:${statusColor};">${statusLabel}</b></p>
    <p style="margin:0 0 8px;">점수(연애/결혼/리스크): <b>${scores}</b></p>
    <p style="margin:0 0 8px;">오류: <b>${payload.error ?? "없음"}</b></p>
    <p style="margin:0 0 8px;">모델 버전: <b>${payload.result?.modelVersion ?? "-"}</b></p>
  </div>`;
}

async function sendAdminSummaryWithResend(payload: AdminSummaryPayload): Promise<EmailSendResult> {
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
      "Idempotency-Key": toAsciiIdempotencyKey(
        "love-job-admin",
        `${payload.requestId}:${payload.status}`,
      ),
    },
    body: JSON.stringify({
      from,
      to: [ADMIN_NOTIFY_EMAIL],
      subject: `[관리자] ${payload.requestId} ${payload.status === "completed" ? "성공" : "실패"}`,
      text: createAdminSummaryText(payload),
      html: createAdminSummaryHtml(payload),
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "resend_admin_summary_failed");
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

export async function sendAdminJobSummaryEmail(payload: AdminSummaryPayload): Promise<EmailSendResult> {
  const mode = process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? "resend" : "console");

  if (mode === "resend") {
    return sendAdminSummaryWithResend(payload);
  }

  console.info(
    JSON.stringify({
      level: "info",
      event: "admin_email_console_preview",
      adminTo: ADMIN_NOTIFY_EMAIL,
      requestId: payload.requestId,
      status: payload.status,
      requesterName: payload.requesterName,
      requesterEmail: payload.requesterEmail,
      error: payload.error ?? null,
      source: payload.source,
    }),
  );

  return {
    provider: "console",
    messageId: null,
  };
}
