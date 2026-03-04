import type { LoveJobInput, LoveJobPublic } from "@/lib/love-job-types";

export type CreateLoveJobResponse = {
  job: LoveJobPublic;
  accessToken: string;
};

async function parseJson(response: Response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.message === "string"
          ? payload.message
          : "요청 처리 중 오류가 발생했어요.";

    throw new Error(message);
  }

  return payload;
}

export async function createLoveJobRequest(input: LoveJobInput, captchaToken?: string) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input, captchaToken }),
  });

  return (await parseJson(response)) as CreateLoveJobResponse;
}

export async function getLoveJobRequest(jobId: string, accessToken: string) {
  const response = await fetch(
    `/api/jobs/${encodeURIComponent(jobId)}?token=${encodeURIComponent(accessToken)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  return (await parseJson(response)) as { job: LoveJobPublic };
}

export async function triggerJobProcessorRequest() {
  const response = await fetch("/api/jobs/process", {
    method: "POST",
  });

  return (await parseJson(response)) as { processed: number };
}

export async function logClientEvent(payload: {
  event: string;
  jobId?: string;
  detail?: Record<string, unknown>;
}) {
  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // best-effort telemetry
  }
}
