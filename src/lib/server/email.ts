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

function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nlToBr(value: string) {
  return escapeHtml(String(value ?? "")).replaceAll("\n", "<br />");
}

function ratioToPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreTone(score: number) {
  if (score >= 80) {
    return { label: "상", color: "#8b2e1f", bg: "#f8ead6" };
  }
  if (score >= 60) {
    return { label: "중상", color: "#7a4e23", bg: "#f7efdf" };
  }
  if (score >= 40) {
    return { label: "중", color: "#5f5a52", bg: "#f2eee7" };
  }
  return { label: "하", color: "#4c4a47", bg: "#ece8df" };
}

function createEmailHtml(payload: EmailSendPayload) {
  const name = escapeHtml(payload.name || "고객");
  const loveScore = clampScore(payload.result.loveScore);
  const marriageScore = clampScore(payload.result.marriageScore);
  const riskScore = clampScore(payload.result.riskScore);
  const loveTone = scoreTone(loveScore);
  const marriageTone = scoreTone(marriageScore);
  const riskTone = scoreTone(100 - riskScore);

  const detailedSections = payload.result.detailedSections ?? [];
  const sectionHtml =
    detailedSections.length > 0
      ? detailedSections
          .map(
            (section) =>
              `<tr>
                <td style="padding:14px 16px;border-top:1px solid #d9ccb4;">
                  <div style="font-size:14px;font-weight:700;color:#3f3020;margin-bottom:8px;">${escapeHtml(section.title)}</div>
                  <div style="font-size:14px;line-height:1.7;color:#4b3a27;">${nlToBr(section.body)}</div>
                </td>
              </tr>`,
          )
          .join("")
      : "";

  const yearGuide = payload.result.yearlyGuidance ?? [];
  const yearGuideHtml =
    yearGuide.length > 0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:#fffaf1;">
          <tr style="background:#f3e8d4;">
            <th align="left" style="padding:10px 12px;font-size:12px;color:#5a4631;">연도</th>
            <th align="left" style="padding:10px 12px;font-size:12px;color:#5a4631;">연애 기회</th>
            <th align="left" style="padding:10px 12px;font-size:12px;color:#5a4631;">관계 리스크</th>
            <th align="left" style="padding:10px 12px;font-size:12px;color:#5a4631;">풀이</th>
          </tr>${yearGuide
          .map(
            (row) =>
              `<tr>
                <td style="padding:10px 12px;border-top:1px solid #e6dbc7;font-size:13px;color:#4b3a27;font-weight:700;">${escapeHtml(String(row.year))}년</td>
                <td style="padding:10px 12px;border-top:1px solid #e6dbc7;font-size:13px;color:#8b2e1f;">${ratioToPercent(row.loveChance)}%</td>
                <td style="padding:10px 12px;border-top:1px solid #e6dbc7;font-size:13px;color:#6e4c28;">${ratioToPercent(row.breakupRisk)}%</td>
                <td style="padding:10px 12px;border-top:1px solid #e6dbc7;font-size:13px;color:#4b3a27;line-height:1.6;">${nlToBr(row.focus)}</td>
              </tr>`,
          )
          .join("")}</table>`
      : "";

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#efe5cf;">
  <tr>
    <td align="center" style="padding:20px 10px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;border-collapse:collapse;background:#fbf5e8;border:2px solid #7a5a34;">
        <tr>
          <td style="padding:16px 18px;background:#4f2f1f;color:#f3dfbf;border-bottom:2px solid #7a5a34;">
            <div style="font-size:12px;letter-spacing:1px;">고전 사주 연애첩</div>
            <div style="font-size:22px;font-weight:800;line-height:1.35;margin-top:6px;">${name}님의 연애운 풀이서</div>
            <div style="font-size:12px;opacity:0.9;margin-top:8px;">요청 ID: ${escapeHtml(payload.requestId)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 18px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td width="33.33%" style="padding:4px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:${loveTone.bg};">
                    <tr><td style="padding:12px;">
                      <div style="font-size:12px;color:#6e4c28;">연애 운세</div>
                      <div style="font-size:26px;font-weight:800;color:${loveTone.color};line-height:1.2;">${loveScore}</div>
                      <div style="font-size:12px;color:#6e4c28;">격: ${loveTone.label}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33.33%" style="padding:4px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:${marriageTone.bg};">
                    <tr><td style="padding:12px;">
                      <div style="font-size:12px;color:#6e4c28;">혼인 안정</div>
                      <div style="font-size:26px;font-weight:800;color:${marriageTone.color};line-height:1.2;">${marriageScore}</div>
                      <div style="font-size:12px;color:#6e4c28;">격: ${marriageTone.label}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33.33%" style="padding:4px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:${riskTone.bg};">
                    <tr><td style="padding:12px;">
                      <div style="font-size:12px;color:#6e4c28;">갈등 기운</div>
                      <div style="font-size:26px;font-weight:800;color:${riskTone.color};line-height:1.2;">${riskScore}</div>
                      <div style="font-size:12px;color:#6e4c28;">완화도: ${riskTone.label}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 18px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:#fffaf1;">
              <tr><td style="padding:14px 16px;">
                <div style="font-size:14px;font-weight:700;color:#4b3a27;margin-bottom:6px;">총평</div>
                <div style="font-size:14px;line-height:1.7;color:#4b3a27;">${nlToBr(payload.result.summary)}</div>
              </td></tr>
              <tr><td style="padding:14px 16px;border-top:1px solid #e6dbc7;">
                <div style="font-size:14px;font-weight:700;color:#4b3a27;margin-bottom:6px;">좋은 흐름</div>
                <div style="font-size:14px;line-height:1.7;color:#4b3a27;">${nlToBr(payload.result.highlight)}</div>
              </td></tr>
              <tr><td style="padding:14px 16px;border-top:1px solid #e6dbc7;">
                <div style="font-size:14px;font-weight:700;color:#4b3a27;margin-bottom:6px;">주의 포인트</div>
                <div style="font-size:14px;line-height:1.7;color:#4b3a27;">${nlToBr(payload.result.caution)}</div>
              </td></tr>
              <tr><td style="padding:14px 16px;border-top:1px solid #e6dbc7;">
                <div style="font-size:14px;font-weight:700;color:#4b3a27;margin-bottom:6px;">때를 보는 힌트</div>
                <div style="font-size:14px;line-height:1.7;color:#4b3a27;">${nlToBr(payload.result.timingHint)}</div>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px 0;">
            <div style="font-size:15px;font-weight:800;color:#3f3020;margin:0 0 8px;">연도별 흐름</div>
            ${yearGuideHtml || `<div style="padding:12px 14px;border:1px solid #d9ccb4;background:#fffaf1;color:#5a4631;font-size:13px;">연도별 가이드 데이터가 없습니다.</div>`}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px 0;">
            <div style="font-size:15px;font-weight:800;color:#3f3020;margin:0 0 8px;">상세 풀이</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:#fffaf1;">
              ${sectionHtml || `<tr><td style="padding:14px 16px;color:#5a4631;font-size:13px;">상세 섹션 데이터가 없습니다.</td></tr>`}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 18px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #d9ccb4;background:#f6efe1;">
              <tr><td style="padding:12px 14px;font-size:12px;color:#5a4631;line-height:1.65;">
                모델: ${escapeHtml(payload.result.modelVersion)} · 신뢰도 ${ratioToPercent(payload.result.confidence)}%
                <br />
                본 결과는 참고용 콘텐츠이며, 실제 관계의 핵심은 상호 존중과 대화입니다.
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
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
    `${payload.name || "고객"}님의 연애운 풀이서`,
    `요청 ID: ${payload.requestId}`,
    `연애 운세: ${clampScore(payload.result.loveScore)} / 100`,
    `혼인 안정: ${clampScore(payload.result.marriageScore)} / 100`,
    `갈등 기운: ${clampScore(payload.result.riskScore)} / 100`,
    `핵심 요약: ${payload.result.summary}`,
    `좋은 흐름: ${payload.result.highlight}`,
    `주의 포인트: ${payload.result.caution}`,
    `타이밍 힌트: ${payload.result.timingHint}`,
    sectionText,
    yearGuideText,
    "",
    `모델: ${payload.result.modelVersion} · 신뢰도 ${ratioToPercent(payload.result.confidence)}%`,
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
      subject: "[사주첩] 요청하신 연애운 풀이가 도착했습니다",
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
