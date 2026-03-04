import { nanoid } from "nanoid";
import { buildLoveResult } from "@/lib/love-result";
import type { LoveJob, LoveJobInput, LoveJobPublic, LoveJobResult } from "@/lib/love-job-types";
import {
  claimQueuedLoveJob,
  createLoveJob,
  findProcessableLoveJobs,
  getLoveJobById,
  updateLoveJob,
} from "@/lib/server/firestore-repo";
import { sendLoveResultEmail } from "@/lib/server/email";
import { hashToken, verifyToken } from "@/lib/server/hash";

function defaultInput(input: LoveJobInput): LoveJobInput {
  return {
    ...input,
    name: input.name?.trim() ?? "",
    email: input.email?.trim().toLowerCase() ?? "",
    birthPlace: input.birthPlace?.trim() || "대한민국",
    birthTime: input.birthTime?.trim() || "",
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeNameForJobId(name: string) {
  const normalized = name
    .normalize("NFKC")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return normalized || "guest";
}

export function validateLoveInput(input: LoveJobInput) {
  if (!input.birthDate) {
    throw new Error("birth_date_required");
  }

  if (!isValidEmail(input.email)) {
    throw new Error("email_invalid");
  }

  if (input.gender !== "female" && input.gender !== "male") {
    throw new Error("gender_invalid");
  }

  if (input.calendarType !== "solar" && input.calendarType !== "lunar") {
    throw new Error("calendar_type_invalid");
  }

  if (
    input.birthDate.length > 20 ||
    input.birthTime.length > 10 ||
    input.birthPlace.length > 120 ||
    input.email.length > 200
  ) {
    throw new Error("input_length_invalid");
  }
}

export function sanitizeLoveJob(job: LoveJob): LoveJobPublic {
  return {
    id: job.id,
    status: job.status,
    input: job.input,
    result: job.result,
    error: job.error,
    email: job.email,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    processingStartedAt: job.processingStartedAt,
    processingCompletedAt: job.processingCompletedAt,
    retryCount: job.retryCount,
  };
}

export async function createLoveJobWithToken(payload: {
  input: LoveJobInput;
  ip: string;
  ua: string;
}) {
  const normalizedInput = defaultInput(payload.input);
  validateLoveInput(normalizedInput);

  const namePart = normalizeNameForJobId(normalizedInput.name);
  const id = `${namePart}-${nanoid(12)}`;
  const accessToken = nanoid(32);
  const now = Date.now();

  const job: LoveJob = {
    id,
    status: "queued",
    input: normalizedInput,
    result: null,
    error: null,
    email: {
      to: normalizedInput.email,
      provider: process.env.RESEND_API_KEY ? "resend" : "console",
      messageId: null,
      sent: false,
      sentAt: null,
      error: null,
    },
    accessTokenHash: hashToken(accessToken),
    createdAt: now,
    updatedAt: now,
    processingStartedAt: null,
    processingCompletedAt: null,
    retryCount: 0,
    requestMeta: {
      ip: payload.ip,
      ua: payload.ua,
    },
  };

  await createLoveJob(job);

  return {
    job: sanitizeLoveJob(job),
    accessToken,
  };
}

export async function getAuthorizedLoveJob(jobId: string, accessToken: string) {
  const job = await getLoveJobById(jobId);
  if (!job) return null;

  if (!verifyToken(accessToken, job.accessTokenHash)) {
    throw new Error("job_access_denied");
  }

  return job;
}

export async function processLoveJob(jobId: string) {
  const now = Date.now();
  const claimed = await claimQueuedLoveJob(jobId, now);

  if (!claimed) {
    const existing = await getLoveJobById(jobId);
    return existing ? sanitizeLoveJob(existing) : null;
  }

  const job = claimed;

  // Defensive guard: if email is already marked sent, never send again.
  if (job.email.sent) {
    await updateLoveJob(job.id, {
      status: "completed",
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      error: null,
      result: job.result,
    });

    const refreshed = await getLoveJobById(job.id);
    return refreshed ? sanitizeLoveJob(refreshed) : null;
  }

  let result: LoveJobResult | null = null;
  let sentEmail: { provider: "resend" | "console"; messageId: string | null; sentAt: number } | null = null;

  try {
    result = buildLoveResult(job.input);

    const emailResult = await sendLoveResultEmail({
      to: job.input.email,
      name: job.input.name,
      requestId: job.id,
      result,
    });
    sentEmail = {
      provider: emailResult.provider,
      messageId: emailResult.messageId,
      sentAt: Date.now(),
    };

    await updateLoveJob(job.id, {
      status: "completed",
      result,
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      error: null,
      email: {
        ...job.email,
        provider: sentEmail.provider,
        messageId: sentEmail.messageId,
        sent: true,
        sentAt: sentEmail.sentAt,
        error: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "analysis_or_email_failed";

    await updateLoveJob(job.id, {
      status: sentEmail ? "completed" : "failed",
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      error: sentEmail ? null : message,
      result,
      retryCount: sentEmail ? job.retryCount ?? 0 : (job.retryCount ?? 0) + 1,
      email: {
        ...job.email,
        provider: sentEmail?.provider ?? job.email.provider,
        messageId: sentEmail?.messageId ?? job.email.messageId,
        sent: Boolean(sentEmail),
        sentAt: sentEmail?.sentAt ?? job.email.sentAt,
        error: sentEmail ? null : message,
      },
    });
  }

  const refreshed = await getLoveJobById(job.id);
  return refreshed ? sanitizeLoveJob(refreshed) : null;
}

export async function processLoveJobsBatch(limitCount = 10) {
  const jobs = await findProcessableLoveJobs(limitCount);
  let processed = 0;

  for (const job of jobs) {
    const next = await processLoveJob(job.id);
    if (next?.status === "completed" || next?.status === "failed") {
      processed += 1;
    }
  }

  return processed;
}
