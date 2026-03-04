#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(ROOT_DIR, "schemas", "love-report.schema.json");
const LOVE_JOBS_COLLECTION = "sajuRequests";
const DEFAULT_MAX = 5;
const DEFAULT_LOOP_INTERVAL_SEC = 45;
const DEFAULT_EXEC_TIMEOUT_SEC = 240;
const DEFAULT_STALE_PROCESSING_SEC = 900;

function nowIso() {
  return new Date().toISOString();
}

function log(level, event, detail = {}) {
  console.log(
    JSON.stringify({
      level,
      event,
      detail,
      ts: nowIso(),
    }),
  );
}

function parseArgs(argv) {
  const args = {
    once: false,
    loop: false,
    max: DEFAULT_MAX,
    intervalSec: DEFAULT_LOOP_INTERVAL_SEC,
    execTimeoutSec: Number(process.env.CODEX_EXEC_TIMEOUT_SEC || DEFAULT_EXEC_TIMEOUT_SEC),
    staleProcessingSec: Number(
      process.env.CODEX_STALE_PROCESSING_SEC || DEFAULT_STALE_PROCESSING_SEC,
    ),
    model: process.env.CODEX_MODEL?.trim() || "",
  };

  for (const raw of argv) {
    if (raw === "--once") args.once = true;
    if (raw === "--loop") args.loop = true;
    if (raw.startsWith("--max=")) {
      const next = Number(raw.split("=")[1]);
      if (Number.isFinite(next) && next > 0) args.max = Math.floor(next);
    }
    if (raw.startsWith("--interval=")) {
      const next = Number(raw.split("=")[1]);
      if (Number.isFinite(next) && next >= 5) args.intervalSec = Math.floor(next);
    }
    if (raw.startsWith("--model=")) {
      args.model = raw.split("=")[1]?.trim() ?? "";
    }
    if (raw.startsWith("--timeout=")) {
      const next = Number(raw.split("=")[1]);
      if (Number.isFinite(next) && next >= 30) args.execTimeoutSec = Math.floor(next);
    }
    if (raw.startsWith("--stale=")) {
      const next = Number(raw.split("=")[1]);
      if (Number.isFinite(next) && next >= 60) args.staleProcessingSec = Math.floor(next);
    }
  }

  if (!args.once && !args.loop) {
    args.once = true;
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFirebaseAdmin() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const hasExplicit = Boolean(projectId && clientEmail && privateKeyRaw);
  const hasFile = Boolean(credentialsFile);

  if (!hasExplicit && !hasFile) {
    throw new Error("firebase_admin_credentials_missing");
  }

  if (!getApps().length) {
    if (hasExplicit && projectId && clientEmail && privateKeyRaw) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
      });
    }
  }

  return getFirestore();
}

function baseEmail(job) {
  const fallbackProvider = process.env.RESEND_API_KEY ? "resend" : "console";
  return {
    to: job?.input?.email ?? "",
    provider: job?.email?.provider ?? fallbackProvider,
    messageId: job?.email?.messageId ?? null,
    sent: Boolean(job?.email?.sent),
    sentAt: job?.email?.sentAt ?? null,
    error: job?.email?.error ?? null,
  };
}

async function claimNextQueuedJob(db, scanLimit = 20) {
  const snap = await db
    .collection(LOVE_JOBS_COLLECTION)
    .where("status", "==", "queued")
    .limit(scanLimit)
    .get();

  for (const row of snap.docs) {
    try {
      const claimed = await db.runTransaction(async (tx) => {
        const ref = db.collection(LOVE_JOBS_COLLECTION).doc(row.id);
        const fresh = await tx.get(ref);
        if (!fresh.exists) return null;

        const current = fresh.data();
        if (!current || current.status !== "queued") return null;

        const now = Date.now();
        tx.update(ref, {
          status: "processing",
          processingStartedAt: now,
          updatedAt: now,
          error: null,
        });

        return {
          id: row.id,
          ...current,
        };
      });

      if (claimed) {
        return claimed;
      }
    } catch {
      // Concurrent claim conflict: skip and continue.
    }
  }

  return null;
}

async function recoverStaleProcessingJobs(db, staleProcessingSec, scanLimit = 20) {
  if (!Number.isFinite(staleProcessingSec) || staleProcessingSec < 60) {
    return 0;
  }

  const now = Date.now();
  const staleMs = staleProcessingSec * 1000;
  const snap = await db
    .collection(LOVE_JOBS_COLLECTION)
    .where("status", "==", "processing")
    .limit(scanLimit)
    .get();

  let recovered = 0;

  for (const row of snap.docs) {
    const current = row.data();
    const startedAt = Number(current?.processingStartedAt ?? 0);
    if (!startedAt || now - startedAt < staleMs) continue;

    try {
      const updated = await db.runTransaction(async (tx) => {
        const ref = db.collection(LOVE_JOBS_COLLECTION).doc(row.id);
        const fresh = await tx.get(ref);
        if (!fresh.exists) return false;

        const job = fresh.data();
        if (!job || job.status !== "processing") return false;

        const freshStartedAt = Number(job.processingStartedAt ?? 0);
        if (!freshStartedAt || now - freshStartedAt < staleMs) return false;

        tx.update(ref, {
          status: "queued",
          updatedAt: now,
          processingStartedAt: null,
          processingCompletedAt: now,
          error: "processing_stale_requeued",
          retryCount: Number(job.retryCount ?? 0) + 1,
          email: {
            ...baseEmail(job),
            sent: false,
            error: "processing_stale_requeued",
          },
        });

        return true;
      });

      if (updated) {
        recovered += 1;
        log("info", "job_stale_recovered", {
          jobId: row.id,
          staleProcessingSec,
        });
      }
    } catch {
      // Ignore concurrent updates and continue.
    }
  }

  return recovered;
}

function parseJsonOutput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("codex_output_empty");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last < 0 || last <= first) {
      throw new Error("codex_output_not_json");
    }
    const candidate = trimmed.slice(first, last + 1);
    return JSON.parse(candidate);
  }
}

function assertLoveResultShape(result) {
  const requiredStrings = [
    "summary",
    "highlight",
    "caution",
    "timingHint",
    "detailedReport",
    "modelVersion",
  ];
  const requiredScores = ["loveScore", "marriageScore", "riskScore"];

  for (const key of requiredStrings) {
    if (typeof result?.[key] !== "string" || result[key].length === 0) {
      throw new Error(`result_missing_string_${key}`);
    }
  }

  for (const key of requiredScores) {
    if (!Number.isFinite(result?.[key])) {
      throw new Error(`result_missing_score_${key}`);
    }
  }

  if (!Array.isArray(result?.detailedSections) || result.detailedSections.length === 0) {
    throw new Error("result_missing_detailedSections");
  }
}

function buildCodexPrompt(job) {
  const nowYear = new Date().getFullYear();

  return [
    "너는 한국어 사주 연애/결혼운 전문 분석가다.",
    "아래 입력값만 사용해서 매우 상세하고 실전적인 리포트를 작성하라.",
    "반드시 JSON Schema를 100% 준수하고 JSON 외 텍스트를 출력하지 마라.",
    "운세를 단정적으로 확정하지 말고 경향성과 실행 전략 중심으로 작성하라.",
    "각 본문은 한국어로 자연스럽게 작성하고, 구체적 행동 가이드를 포함하라.",
    `연도 가이드는 ${nowYear}년 ~ ${nowYear + 9}년 범위에서 작성하라.`,
    "",
    "입력 데이터:",
    JSON.stringify(
      {
        requestId: job.id,
        name: job?.input?.name ?? "",
        gender: job?.input?.gender ?? "",
        calendarType: job?.input?.calendarType ?? "",
        birthDate: job?.input?.birthDate ?? "",
        birthTime: job?.input?.birthTime ?? "",
        birthPlace: job?.input?.birthPlace ?? "",
      },
      null,
      2,
    ),
  ].join("\n");
}

async function runCodexReport(job, model, execTimeoutSec) {
  const outPath = path.join(os.tmpdir(), `codex-love-report-${job.id}-${Date.now()}.json`);
  const prompt = buildCodexPrompt(job);

  const args = [
    "exec",
    "--cd",
    ROOT_DIR,
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--output-schema",
    SCHEMA_PATH,
    "--output-last-message",
    outPath,
  ];

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);

  log("info", "codex_exec_start", {
    jobId: job.id,
    model: model || "default",
    timeoutSec: execTimeoutSec,
  });

  const { code, stderr, timeoutHit, durationMs } = await new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrBuf = "";
    let timeoutHit = false;
    let settled = false;
    const startAt = Date.now();
    const timeoutMs = execTimeoutSec * 1000;
    const timer = setTimeout(() => {
      timeoutHit = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000).unref();
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderrBuf += String(chunk ?? "");
    });

    // Drain stdout so child process never blocks on a full stdout pipe.
    child.stdout.on("data", () => {});

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: exitCode ?? 1,
        stderr: stderrBuf.trim(),
        timeoutHit,
        durationMs: Date.now() - startAt,
      });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: 1,
        stderr: String(error?.message ?? error),
        timeoutHit,
        durationMs: Date.now() - startAt,
      });
    });
  });

  if (timeoutHit) {
    throw new Error(`codex_exec_timeout:${execTimeoutSec}s`);
  }

  if (code !== 0) {
    throw new Error(`codex_exec_failed:${stderr || "unknown"}`);
  }

  log("info", "codex_exec_done", {
    jobId: job.id,
    durationMs,
  });

  try {
    const raw = await readFile(outPath, "utf8");
    const parsed = parseJsonOutput(raw);
    assertLoveResultShape(parsed);
    return parsed;
  } finally {
    await rm(outPath, { force: true }).catch(() => {});
  }
}

async function sendResultEmail(job, result) {
  const mode = process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? "resend" : "console");
  const to = job?.input?.email ?? "";
  const name = job?.input?.name ?? "고객";

  if (!to) {
    throw new Error("email_missing");
  }

  if (mode !== "resend") {
    log("info", "email_console_preview", {
      to,
      requestId: job.id,
      summary: result.summary,
    });
    return {
      provider: "console",
      messageId: null,
      sentAt: Date.now(),
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("resend_not_configured");
  }

  const lines = [
    `${name}님의 연애운 분석 결과`,
    `요청 ID: ${job.id}`,
    `핵심 요약: ${result.summary}`,
    `좋은 흐름: ${result.highlight}`,
    `주의 포인트: ${result.caution}`,
    `타이밍 힌트: ${result.timingHint}`,
    "",
    result.detailedReport,
  ];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `codex-worker-love-${job.id}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[사주 결과] 요청하신 연애운 리포트",
      text: lines.join("\n"),
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.55;color:#111827;">
        <h2 style="margin:0 0 12px;">${name}님의 연애운 분석 결과</h2>
        <p style="margin:0 0 10px;">요청 ID: <b>${job.id}</b></p>
        <p style="margin:0 0 10px;">핵심 요약: ${result.summary}</p>
        <p style="margin:0 0 10px;">좋은 흐름: ${result.highlight}</p>
        <p style="margin:0 0 10px;">주의 포인트: ${result.caution}</p>
        <p style="margin:0 0 10px;">타이밍 힌트: ${result.timingHint}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;" />
        ${result.detailedSections
          .map((section) => `<h3 style="margin:12px 0 6px;">${section.title}</h3><p style="margin:0 0 8px;">${section.body}</p>`)
          .join("")}
      </div>`,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.message ?? "resend_send_failed");
  }

  return {
    provider: "resend",
    messageId: body?.id ?? null,
    sentAt: Date.now(),
  };
}

async function completeJob(db, job, result, email) {
  await db
    .collection(LOVE_JOBS_COLLECTION)
    .doc(job.id)
    .update({
      status: "completed",
      result,
      error: null,
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      email: {
        ...baseEmail(job),
        provider: email.provider,
        messageId: email.messageId,
        sent: true,
        sentAt: email.sentAt,
        error: null,
      },
    });
}

async function failJob(db, job, errorMessage) {
  const retryCount = Number(job?.retryCount ?? 0) + 1;

  await db
    .collection(LOVE_JOBS_COLLECTION)
    .doc(job.id)
    .update({
      status: "failed",
      error: errorMessage,
      updatedAt: Date.now(),
      processingCompletedAt: Date.now(),
      retryCount,
      email: {
        ...baseEmail(job),
        sent: false,
        error: errorMessage,
      },
    });
}

async function processOneJob(db, job, model, execTimeoutSec) {
  if (job?.email?.sent) {
    await db
      .collection(LOVE_JOBS_COLLECTION)
      .doc(job.id)
      .update({
        status: "completed",
        error: null,
        updatedAt: Date.now(),
        processingCompletedAt: Date.now(),
      });
    log("info", "job_skip_already_sent", { jobId: job.id });
    return "completed";
  }

  let result = null;
  try {
    result = await runCodexReport(job, model, execTimeoutSec);
    const email = await sendResultEmail(job, result);
    await completeJob(db, job, result, email);
    log("info", "job_completed", {
      jobId: job.id,
      provider: email.provider,
      messageId: email.messageId,
    });
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_failed";
    await failJob(db, job, message);
    log("error", "job_failed", {
      jobId: job.id,
      message,
    });
    return "failed";
  }
}

async function runBatch(db, maxJobs, model, execTimeoutSec, staleProcessingSec) {
  let processed = 0;
  let completed = 0;
  let failed = 0;
  const recovered = await recoverStaleProcessingJobs(db, staleProcessingSec, maxJobs * 2);

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimNextQueuedJob(db, 20);
    if (!job) break;

    processed += 1;
    const status = await processOneJob(db, job, model, execTimeoutSec);
    if (status === "completed") completed += 1;
    if (status === "failed") failed += 1;
  }

  return { processed, completed, failed, recovered };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = ensureFirebaseAdmin();

  log("info", "worker_start", {
    mode: args.loop ? "loop" : "once",
    max: args.max,
    intervalSec: args.intervalSec,
    execTimeoutSec: args.execTimeoutSec,
    staleProcessingSec: args.staleProcessingSec,
    model: args.model || "default",
  });

  if (args.once) {
    const batch = await runBatch(
      db,
      args.max,
      args.model,
      args.execTimeoutSec,
      args.staleProcessingSec,
    );
    log("info", "worker_batch_done", batch);
    return;
  }

  while (true) {
    const batch = await runBatch(
      db,
      args.max,
      args.model,
      args.execTimeoutSec,
      args.staleProcessingSec,
    );
    log("info", "worker_batch_done", batch);
    await sleep(args.intervalSec * 1000);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log("error", "worker_crash", { message });
  process.exit(1);
});
