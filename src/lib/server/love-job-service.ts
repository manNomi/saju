import { nanoid } from "nanoid";
import { buildLoveResult } from "@/lib/love-result";
import {
  LOVE_PRICE_KRW,
  type LoveJob,
  type LoveJobInput,
  type LoveJobPublic,
} from "@/lib/love-job-types";
import {
  createLoveJob,
  findProcessableLoveJobs,
  getLoveJobById,
  updateLoveJob,
} from "@/lib/server/firestore-repo";
import { hashToken, verifyToken } from "@/lib/server/hash";

function buildOrderId() {
  return `saju_${Date.now()}_${nanoid(8)}`;
}

function defaultInput(input: LoveJobInput): LoveJobInput {
  return {
    ...input,
    name: input.name?.trim() ?? "",
    birthPlace: input.birthPlace?.trim() || "대한민국",
    birthTime: input.birthTime?.trim() || "",
  };
}

export function validateLoveInput(input: LoveJobInput) {
  if (!input.birthDate) {
    throw new Error("birth_date_required");
  }

  if (input.gender !== "female" && input.gender !== "male") {
    throw new Error("gender_invalid");
  }

  if (input.calendarType !== "solar" && input.calendarType !== "lunar") {
    throw new Error("calendar_type_invalid");
  }

  if (input.birthDate.length > 20 || input.birthTime.length > 10 || input.birthPlace.length > 120) {
    throw new Error("input_length_invalid");
  }
}

export function sanitizeLoveJob(job: LoveJob): LoveJobPublic {
  return {
    id: job.id,
    status: job.status,
    paymentStatus: job.paymentStatus,
    input: job.input,
    result: job.result,
    error: job.error,
    payment: {
      provider: job.payment.provider,
      orderId: job.payment.orderId,
      amount: job.payment.amount,
      currency: job.payment.currency,
      paidAt: job.payment.paidAt,
      confirmedAt: job.payment.confirmedAt,
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    processingStartedAt: job.processingStartedAt,
    processingCompletedAt: job.processingCompletedAt,
  };
}

export async function createLoveJobWithToken(payload: {
  input: LoveJobInput;
  ip: string;
  ua: string;
}) {
  const normalizedInput = defaultInput(payload.input);
  validateLoveInput(normalizedInput);

  const id = nanoid(20);
  const accessToken = nanoid(32);
  const now = Date.now();

  const job: LoveJob = {
    id,
    status: "awaiting_payment",
    paymentStatus: "unpaid",
    input: normalizedInput,
    result: null,
    error: null,
    payment: {
      provider: "toss",
      orderId: buildOrderId(),
      amount: LOVE_PRICE_KRW,
      currency: "KRW",
      paymentKey: null,
      paidAt: null,
      confirmedAt: null,
    },
    accessTokenHash: hashToken(accessToken),
    createdAt: now,
    updatedAt: now,
    processingStartedAt: null,
    processingCompletedAt: null,
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

export async function markPaymentAsPaid(payload: {
  jobId: string;
  accessToken: string;
  paymentKey: string;
}) {
  const job = await getAuthorizedLoveJob(payload.jobId, payload.accessToken);
  if (!job) {
    throw new Error("job_not_found");
  }

  if (job.paymentStatus === "paid") {
    return sanitizeLoveJob(job);
  }

  const now = Date.now();

  await updateLoveJob(job.id, {
    paymentStatus: "paid",
    status: "pending",
    updatedAt: now,
    payment: {
      ...job.payment,
      paymentKey: payload.paymentKey,
      paidAt: now,
      confirmedAt: now,
    },
    error: null,
  });

  const updated = await getLoveJobById(job.id);
  if (!updated) throw new Error("job_not_found_after_update");
  return sanitizeLoveJob(updated);
}

export async function processLoveJob(jobId: string) {
  const job = await getLoveJobById(jobId);
  if (!job) return null;
  if (job.status !== "pending" || job.paymentStatus !== "paid") {
    return sanitizeLoveJob(job);
  }

  const now = Date.now();

  await updateLoveJob(job.id, {
    status: "processing",
    processingStartedAt: now,
    updatedAt: now,
  });

  try {
    const result = buildLoveResult(job.input);

    await updateLoveJob(job.id, {
      status: "completed",
      result,
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      error: null,
    });
  } catch (error) {
    await updateLoveJob(job.id, {
      status: "failed",
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      error: error instanceof Error ? error.message : "analysis_failed",
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
