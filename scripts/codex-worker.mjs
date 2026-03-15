#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const ADMIN_NOTIFY_EMAIL = "hanmw110@naver.com";
const OPTIMISTIC_PROMO_DATE_KST = "2026-03-15";
const ENGINE_MODULE_URL = pathToFileURL(path.join(ROOT_DIR, "src/lib/saju-love-engine.ts")).href;
let engineModulePromise = null;

function nowIso() {
  return new Date().toISOString();
}

async function getEngineModule() {
  if (!engineModulePromise) {
    engineModulePromise = import(ENGINE_MODULE_URL);
  }
  return engineModulePromise;
}

function normalizeBirthInput(rawInput) {
  return {
    birthDate: String(rawInput?.birthDate ?? ""),
    birthTime: String(rawInput?.birthTime ?? ""),
    gender: rawInput?.gender === "male" ? "male" : "female",
    calendarType: rawInput?.calendarType === "lunar" ? "lunar" : "solar",
    birthPlace: String(rawInput?.birthPlace ?? "대한민국"),
  };
}

async function buildEngineBaseline(job) {
  const engine = await getEngineModule();
  const normalized = normalizeBirthInput(job?.input);
  const analysis = engine.analyzeLoveFortune(normalized);

  return {
    loveScore: analysis.loveScore,
    marriageScore: analysis.marriageScore,
    riskScore: analysis.riskScore,
    confidence: analysis.confidence,
    dominantElement: engine.toKoreanElementName(analysis.elementProfile.dominant),
    weakestElement: engine.toKoreanElementName(analysis.elementProfile.weakest),
    topYears: analysis.topYears.map((row) => ({
      year: row.year,
      loveChance: row.loveChance,
      breakupRisk: row.breakupRisk,
    })),
    evidenceCodes: analysis.evidenceCodes,
    modelVersion: analysis.modelVersion,
  };
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

const PHRASING_REPLACEMENTS = [
  [/분기당/g, "앞으로 3개월 동안"],
  [/분기/g, "3개월"],
  [/신규 만남 채널/g, "새로운 만남 자리"],
  [/만남 채널/g, "만남 자리"],
  [/채널/g, "방법"],
  [/48시간 내/g, "이틀 안에"],
  [/48시간 이내/g, "이틀 안에"],
  [/24시간 내/g, "하루 안에"],
  [/24시간 이내/g, "하루 안에"],
  [/72시간 내/g, "사흘 안에"],
  [/72시간 이내/g, "사흘 안에"],
  [/고정하고/g, "정해서"],
  [/액션아이템/g, "실천할 일"],
  [/KPI/g, "기준"],
  [/포트폴리오/g, "균형"],
  [/파이프라인/g, "흐름"],
];

function normalizeKoreanPhrasing(text) {
  let out = String(text ?? "");
  for (const [pattern, replacement] of PHRASING_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function normalizeLoveResultPhrasing(result) {
  return {
    ...result,
    summary: normalizeKoreanPhrasing(result.summary),
    highlight: normalizeKoreanPhrasing(result.highlight),
    caution: normalizeKoreanPhrasing(result.caution),
    timingHint: normalizeKoreanPhrasing(result.timingHint),
    detailedReport: normalizeKoreanPhrasing(result.detailedReport),
    detailedSections: Array.isArray(result.detailedSections)
      ? result.detailedSections.map((section) => ({
          ...section,
          title: normalizeKoreanPhrasing(section.title),
          body: normalizeKoreanPhrasing(section.body),
        }))
      : [],
    yearlyGuidance: Array.isArray(result.yearlyGuidance)
      ? result.yearlyGuidance.map((row) => ({
          ...row,
          focus: normalizeKoreanPhrasing(row.focus),
        }))
      : [],
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function getKstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return {
    key: `${year}-${month}-${day}`,
    year: Number(year),
  };
}

function isOptimisticPromoDay(now = new Date()) {
  return getKstDateParts(now).key === OPTIMISTIC_PROMO_DATE_KST;
}

function applyTodayOptimisticBoost(result) {
  if (!isOptimisticPromoDay()) return result;

  const { year: currentYear } = getKstDateParts();
  const safeYear = Number.isFinite(currentYear) ? currentYear : new Date().getFullYear();

  const topYearsBase = Array.isArray(result?.topYears) ? result.topYears : [];
  const topYearsRaised = topYearsBase.map((row, idx) => ({
    ...row,
    loveChance: clamp01(Math.max(row?.loveChance ?? 0, idx === 0 ? 0.78 : 0.71)),
    breakupRisk: clamp01(Math.min(row?.breakupRisk ?? 1, idx === 0 ? 0.3 : 0.38)),
  }));

  const topYears = topYearsRaised.some((row) => row.year === safeYear)
    ? topYearsRaised
    : topYearsRaised.length >= 3
      ? [
          ...topYearsRaised.slice(1),
          { year: safeYear, loveChance: 0.79, breakupRisk: 0.28 },
        ].sort((a, b) => a.year - b.year)
      : topYearsRaised;

  const yearlyGuidanceBase = Array.isArray(result?.yearlyGuidance) ? result.yearlyGuidance : [];
  const yearlyGuidanceRaised = yearlyGuidanceBase.map((row) => ({
    ...row,
    loveChance: clamp01(Math.max(row?.loveChance ?? 0, 0.67)),
    breakupRisk: clamp01(Math.min(row?.breakupRisk ?? 1, 0.43)),
  }));

  const yearlyGuidance = yearlyGuidanceRaised.some((row) => row.year === safeYear)
    ? yearlyGuidanceRaised.map((row) =>
        row.year === safeYear
          ? {
              ...row,
              loveChance: clamp01(Math.max(row?.loveChance ?? 0, 0.76)),
              breakupRisk: clamp01(Math.min(row?.breakupRisk ?? 1, 0.31)),
              focus: "기존에는 답답했더라도 올해부터 관계운이 풀리는 상승 구간입니다. 소개/약속을 적극적으로 잡아보세요.",
            }
          : row,
      )
    : yearlyGuidanceRaised.length >= 3
      ? [
          ...yearlyGuidanceRaised.slice(1),
          {
            year: safeYear,
            loveChance: 0.76,
            breakupRisk: 0.31,
            focus: "기존에는 답답했더라도 올해부터 관계운이 풀리는 상승 구간입니다. 소개/약속을 적극적으로 잡아보세요.",
          },
        ].sort((a, b) => a.year - b.year)
      : yearlyGuidanceRaised;

  const detailedSectionsBase = Array.isArray(result?.detailedSections) ? result.detailedSections : [];
  const detailedSections = detailedSectionsBase.map((section, idx) =>
    idx === 0
      ? {
          ...section,
          body: "기존에는 연애운이 다소 낮게 느껴질 수 있었지만, 올해부터는 흐름이 완만하게 풀리는 상승 국면입니다. 점수 기준도 이전 대비 회복 신호가 분명해 관계 진전 가능성이 높아졌습니다. 서두르기보다 만남의 빈도와 약속의 일관성을 높이면 성과가 더 안정적으로 쌓입니다.",
        }
      : section,
  );

  const detailedReport = detailedSections.map((section) => `${section.title}\n${section.body}`).join("\n\n");

  return {
    ...result,
    loveScore: Math.max(Number(result?.loveScore ?? 0), 68),
    marriageScore: Math.max(Number(result?.marriageScore ?? 0), 64),
    riskScore: Math.min(Number(result?.riskScore ?? 100), 45),
    topYears,
    yearlyGuidance,
    summary: "기존에는 연애운이 답답하게 느껴질 수 있었지만, 올해부터는 흐름이 점진적으로 풀리며 관계운이 상승하는 국면입니다.",
    highlight: "올해를 기점으로 인연 유입과 관계 진전 신호가 동시에 살아납니다. 무리한 속도전보다 꾸준한 만남이 좋은 결과로 이어집니다.",
    caution:
      "분위기가 좋아져도 초반 약속과 연락 리듬은 분명히 맞춰 두세요. 그러면 상승 흐름을 더 안정적으로 유지할 수 있습니다.",
    timingHint: "올해부터 연애/관계 지표가 상승 전환으로 들어갑니다. 특히 하반기로 갈수록 체감이 더 좋아질 수 있어요.",
    detailedSections,
    detailedReport,
    evidenceCodes: Array.from(new Set([...(Array.isArray(result?.evidenceCodes) ? result.evidenceCodes : []), "R_PROMO_20260315"])),
  };
}

function buildCodexPrompt(job, baseline) {
  const nowYear = new Date().getFullYear();

  return [
    "역할: 너는 한국어 연애 상담에 능한 사주 분석가다.",
    "목표: 사용자가 읽기 쉽고 바로 행동할 수 있는 연애/결혼 리포트를 작성하라.",
    "중요: 반드시 JSON Schema를 100% 준수하고 JSON 외 텍스트를 출력하지 마라.",
    "",
    "[문체 규칙]",
    "- 상담사가 말하듯 따뜻하지만 단정한 한국어를 사용하라.",
    "- 짧고 쉬운 문장 위주로 작성하라. 어려운 한자어/전문용어를 남발하지 마라.",
    "- 추상적인 표현만 반복하지 말고, 구체적인 행동 제안(언제/무엇을/어떻게)을 넣어라.",
    "- 단정적 예언은 금지하고, '경향 + 선택 가능한 대응' 형태로 설명하라.",
    "- 명령조보다 제안형 문장(예: ~해보세요, ~가 좋아요)을 우선 사용하라.",
    "",
    "[금지 표현]",
    "- 'AI가 분석한 결과', '데이터상', '모델 관점에서' 같은 메타 설명 금지.",
    "- '절대', '무조건', '반드시 된다/망한다' 같은 극단적 확정 문장 금지.",
    "- 같은 의미의 문장을 반복해 길이만 늘리는 표현 금지.",
    "- 비즈니스 보고서 말투 금지: 분기, 채널, KPI, 포트폴리오, 파이프라인, 액션아이템.",
    "- 기계적인 시간 표현 금지: 24시간/48시간/72시간 이내 같은 표현.",
    "",
    "[자연스러운 표현 강제]",
    "- '분기' 대신 '앞으로 3개월'처럼 일상 한국어로 써라.",
    "- '채널' 대신 '자리/모임/방법'처럼 자연어로 바꿔라.",
    "- '48시간 이내' 대신 '이틀 안에'처럼 말하라.",
    "- 숫자를 억지로 고정하지 말고, 필요한 경우에만 1~2회 수준으로 부드럽게 제안하라.",
    "",
    "[독해성 규칙]",
    "- summary/highlight/caution/timingHint는 모바일에서 한 번에 읽히게 간결하게 작성하라.",
    "- detailedSections 각 body는 첫 문장에서 핵심 결론을 먼저 말하고, 뒤에 이유와 행동 팁을 제시하라.",
    "- yearlyGuidance.focus는 해당 연도에 실제로 실천할 행동 1~2개를 포함하라.",
    "- 전체 분량은 필요한 정보만 담아 짧게 유지하라. 같은 의미 반복은 금지한다.",
    "- detailedSections는 3~4개 중심으로 작성하고, 각 body는 3~4문장 내외로 제한하라.",
    "- '갈등 리스크'는 관계에서 오해·다툼·거리감이 커질 가능성임을 쉬운 말로 설명하라.",
    "- 리스크 퍼센트가 높을수록 무엇을 조심해야 하는지 구체적 주의 행동을 제시하라.",
    `- 연도 가이드는 ${nowYear}년 ~ ${nowYear + 9}년 범위에서 작성하라.`,
    "- loveScore, marriageScore, riskScore, confidence, dominantElement, weakestElement, topYears는 아래 baseline 값을 그대로 사용하라.",
    "- evidenceCodes는 baseline에 있는 코드들을 우선 유지하라.",
    "",
    "[최종 자기 점검 후 출력]",
    "1) 문장이 어색하게 AI 답변처럼 보이면 사람 말투로 다시 고쳐라.",
    "2) 추상 표현만 있는 문장을 구체 행동 문장으로 치환하라.",
    "3) JSON 스키마 누락/타입 오류가 없는지 확인하라.",
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
    "",
    "baseline:",
    JSON.stringify(
      {
        loveScore: baseline.loveScore,
        marriageScore: baseline.marriageScore,
        riskScore: baseline.riskScore,
        confidence: baseline.confidence,
        dominantElement: baseline.dominantElement,
        weakestElement: baseline.weakestElement,
        topYears: baseline.topYears,
        evidenceCodes: baseline.evidenceCodes,
        modelVersion: baseline.modelVersion,
      },
      null,
      2,
    ),
  ].join("\n");
}

function applyBaselineToResult(result, baseline) {
  const llmEvidenceCodes = Array.isArray(result?.evidenceCodes) ? result.evidenceCodes : [];
  const mergedEvidenceCodes = Array.from(new Set([...baseline.evidenceCodes, ...llmEvidenceCodes]));

  return {
    ...result,
    loveScore: baseline.loveScore,
    marriageScore: baseline.marriageScore,
    riskScore: baseline.riskScore,
    confidence: baseline.confidence,
    dominantElement: baseline.dominantElement,
    weakestElement: baseline.weakestElement,
    topYears: baseline.topYears,
    evidenceCodes: mergedEvidenceCodes.length >= 3 ? mergedEvidenceCodes : baseline.evidenceCodes,
    modelVersion: `codex-worker+${baseline.modelVersion}`,
  };
}

async function runCodexReport(job, baseline, model, execTimeoutSec) {
  const outPath = path.join(os.tmpdir(), `codex-love-report-${job.id}-${Date.now()}.json`);
  const prompt = buildCodexPrompt(job, baseline);

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
    return applyTodayOptimisticBoost(
      applyBaselineToResult(normalizeLoveResultPhrasing(parsed), baseline),
    );
  } finally {
    await rm(outPath, { force: true }).catch(() => {});
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nlToBr(value) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toAsciiIdempotencyKey(prefix, raw) {
  const digest = createHash("sha256").update(String(raw ?? "")).digest("hex");
  return `${prefix}-${digest.slice(0, 40)}`;
}

function ratioToPercent(ratio) {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

const CARD_RADIUS = "14px";

function getRiskProfile(score) {
  const safeScore = clampPercent(score);
  if (safeScore <= 29) {
    return {
      level: "낮음",
      tone: "#12b76a",
      meaning: "작은 오해는 생길 수 있지만, 대화로 충분히 풀 수 있는 구간이에요.",
      caution: "연락 간격만 너무 들쑥날쑥하지 않게 유지해 주세요.",
    };
  }
  if (safeScore <= 59) {
    return {
      level: "보통",
      tone: "#f79009",
      meaning: "감정 기복이나 기대치 차이로 작은 충돌이 생길 수 있는 구간이에요.",
      caution: "서운함은 쌓아두지 말고 하루 안에 짧게라도 표현해 주세요.",
    };
  }
  if (safeScore <= 79) {
    return {
      level: "높음",
      tone: "#f04438",
      meaning: "해석 차이와 감정적 반응이 커져 관계가 빠르게 틀어질 수 있는 구간이에요.",
      caution: "중요한 대화는 문자보다 통화/대면으로 하고, 감정이 오른 상태에선 결론을 미루세요.",
    };
  }
  return {
    level: "매우 높음",
    tone: "#b42318",
    meaning: "작은 사건도 크게 번질 수 있어 관계 관리가 특히 중요한 구간이에요.",
    caution: "거리두기·휴식 시간을 먼저 확보하고, 반복 갈등 주제는 규칙을 정해 관리하세요.",
  };
}

function renderRiskBandRows(currentScore) {
  const bands = [
    { range: "0~29%", label: "낮음", advice: "연락 템포만 일정하게 유지하기" },
    { range: "30~59%", label: "보통", advice: "서운함을 빠르게 말로 정리하기" },
    { range: "60~79%", label: "높음", advice: "감정 올라올 때 결론 미루기" },
    { range: "80~100%", label: "매우 높음", advice: "갈등 주제별 대화 규칙 먼저 만들기" },
  ];

  return bands
    .map((band) => {
      const active = (() => {
        const [minText, maxText] = band.range.replace("%", "").split("~");
        const min = Number(minText);
        const max = Number(maxText);
        return currentScore >= min && currentScore <= max;
      })();

      return `
        <tr style="${active ? "background:#fff7ed;" : "background:#ffffff;"}">
          <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#344054;font-weight:${active ? 700 : 500};">${band.range}</td>
          <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#344054;font-weight:${active ? 700 : 500};">${band.label}</td>
          <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#475467;line-height:1.55;">${band.advice}</td>
        </tr>
      `;
    })
    .join("");
}

function renderScoreCard(label, score, fillColor) {
  const safeScore = clampPercent(score);
  const safeLabel = escapeHtml(label);
  return `
    <td width="33.33%" style="padding:8px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};">
        <tr>
          <td style="padding:16px;min-height:124px;vertical-align:top;">
            <div style="font-size:13px;color:#667085;margin-bottom:8px;font-weight:600;">${safeLabel}</div>
            <div style="font-size:24px;font-weight:800;color:#101828;line-height:1.2;">${safeScore}<span style="font-size:13px;color:#667085;"> / 100</span></div>
            <div style="margin-top:12px;height:8px;background:#eef2f6;border-radius:999px;overflow:hidden;">
              <div style="width:${safeScore}%;height:100%;background:${fillColor};"></div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  `;
}

function createEmailText(job, result, name) {
  const detailedSections = Array.isArray(result?.detailedSections) ? result.detailedSections : [];
  const yearlyGuidance = Array.isArray(result?.yearlyGuidance) ? result.yearlyGuidance : [];
  const topYears = Array.isArray(result?.topYears) ? result.topYears : [];
  const riskProfile = getRiskProfile(result?.riskScore);

  const sectionText =
    detailedSections.length > 0
      ? `\n\n${detailedSections.map((section) => `${section.title}\n${section.body}`).join("\n\n")}`
      : "";
  const topYearsText =
    topYears.length > 0
      ? `\n\n핵심 연도\n${topYears
          .map(
            (row) =>
              `- ${row.year}년 · 연애 기회 ${ratioToPercent(row.loveChance)}% · 갈등 리스크 ${ratioToPercent(row.breakupRisk)}%`,
          )
          .join("\n")}`
      : "";
  const yearlyText =
    yearlyGuidance.length > 0
      ? `\n\n연도별 실행 가이드\n${yearlyGuidance
          .map(
            (row) =>
              `- ${row.year}년 · 연애 기회 ${ratioToPercent(row.loveChance)}% · 갈등 리스크 ${ratioToPercent(row.breakupRisk)}% · ${row.focus}`,
          )
          .join("\n")}`
      : "";

  return [
    `${name}님의 연애운 분석 결과`,
    `요청 ID: ${job.id}`,
    `연애 점수: ${clampPercent(result?.loveScore)} / 100`,
    `결혼 안정성: ${clampPercent(result?.marriageScore)} / 100`,
    `갈등 리스크: ${clampPercent(result?.riskScore)} / 100 (${riskProfile.level})`,
    `갈등 리스크 의미: ${riskProfile.meaning}`,
    `주의할 점: ${riskProfile.caution}`,
    "",
    "[리스크 구간 해석]",
    "- 0~29%: 낮음 / 연락 템포 유지",
    "- 30~59%: 보통 / 서운함 빠르게 정리",
    "- 60~79%: 높음 / 감정 올라올 때 결론 미루기",
    "- 80~100%: 매우 높음 / 대화 규칙 먼저 만들기",
    "",
    `핵심 요약: ${result.summary}`,
    `좋은 흐름: ${result.highlight}`,
    `주의 포인트: ${result.caution}`,
    `타이밍 힌트: ${result.timingHint}`,
    topYearsText,
    yearlyText,
    sectionText,
    "",
    `모델 버전: ${result.modelVersion} · 신뢰도 ${ratioToPercent(result.confidence)}%`,
    "본 결과는 참고용 콘텐츠입니다.",
  ].join("\n");
}

function createEmailHtml(job, result, name) {
  const detailedSections = Array.isArray(result?.detailedSections) ? result.detailedSections : [];
  const yearlyGuidance = Array.isArray(result?.yearlyGuidance) ? result.yearlyGuidance : [];
  const topYears = Array.isArray(result?.topYears) ? result.topYears : [];
  const evidenceCodes = Array.isArray(result?.evidenceCodes) ? result.evidenceCodes : [];
  const riskScore = clampPercent(result?.riskScore);
  const riskProfile = getRiskProfile(riskScore);

  const topYearsRows =
    topYears.length > 0
      ? topYears
          .map((row) => {
            const love = ratioToPercent(row.loveChance);
            const risk = ratioToPercent(row.breakupRisk);
            return `
              <tr>
                <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#344054;font-weight:600;">${escapeHtml(row.year)}년</td>
                <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#027a48;font-weight:700;">
                  ${love}%
                  <div style="margin-top:6px;height:6px;background:#e8f7ef;border-radius:999px;overflow:hidden;">
                    <div style="width:${love}%;height:100%;background:#12b76a;"></div>
                  </div>
                </td>
                <td style="padding:12px 10px;border-top:1px solid #f0f2f5;font-size:13px;color:#b54708;font-weight:700;">
                  ${risk}%
                  <div style="margin-top:6px;height:6px;background:#fff1e6;border-radius:999px;overflow:hidden;">
                    <div style="width:${risk}%;height:100%;background:#f79009;"></div>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="3" style="padding:14px 10px;color:#667085;font-size:13px;border-top:1px solid #f0f2f5;">핵심 연도 데이터가 없습니다.</td></tr>`;

  const yearlyRows =
    yearlyGuidance.length > 0
      ? yearlyGuidance
          .map(
            (row) => `
              <tr>
                <td style="padding:14px 0;border-top:1px solid #f0f2f5;">
                  <div style="font-size:13px;color:#101828;font-weight:700;margin-bottom:6px;">${escapeHtml(row.year)}년 · 연애 ${ratioToPercent(row.loveChance)}% · 리스크 ${ratioToPercent(row.breakupRisk)}%</div>
                  <div style="font-size:14px;color:#344054;line-height:1.6;">${nlToBr(row.focus)}</div>
                </td>
              </tr>
            `,
          )
          .join("")
      : "";

  const sectionBlocks =
    detailedSections.length > 0
      ? detailedSections
          .map(
            (section) => `
              <tr>
                <td style="padding:16px;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};background:#ffffff;">
                  <div style="font-size:15px;font-weight:800;color:#101828;margin-bottom:10px;">${escapeHtml(section.title)}</div>
                  <div style="font-size:14px;line-height:1.7;color:#344054;">${nlToBr(section.body)}</div>
                </td>
              </tr>
              <tr><td style="height:12px;"></td></tr>
            `,
          )
          .join("")
      : "";

  const evidenceHtml =
    evidenceCodes.length > 0
      ? `<div style="font-size:12px;color:#667085;margin-top:8px;">근거 코드: ${escapeHtml(evidenceCodes.join(", "))}</div>`
      : "";

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4f6f8;padding:0;margin:0;">
  <tr>
    <td align="center" style="padding:22px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;border-collapse:collapse;background:#ffffff;border:1px solid #e4e7ec;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:22px;background:linear-gradient(135deg,#ff6f0f 0%,#ff9b56 100%);color:#ffffff;">
            <div style="font-size:13px;opacity:0.94;">AI 사주 연애 리포트</div>
            <div style="font-size:24px;font-weight:800;line-height:1.3;margin-top:6px;">${escapeHtml(name)}님의 연애운 결과</div>
            <div style="font-size:13px;opacity:0.95;margin-top:10px;">요청 ID: ${escapeHtml(job.id)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 18px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                ${renderScoreCard("연애 점수", result?.loveScore, "#ff6f0f")}
                ${renderScoreCard("결혼 안정성", result?.marriageScore, "#12b76a")}
                ${renderScoreCard("갈등 리스크", result?.riskScore, "#f79009")}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 22px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff8f2;border:1px solid #fed7aa;border-radius:${CARD_RADIUS};">
              <tr>
                <td style="padding:16px;">
                  <div style="font-size:15px;font-weight:800;color:#9a3412;margin-bottom:8px;">갈등 리스크란?</div>
                  <div style="font-size:14px;color:#7c2d12;line-height:1.65;">연인 사이에서 오해·다툼·거리감이 커질 가능성을 뜻해요.</div>
                  <div style="margin-top:10px;font-size:14px;color:#7c2d12;line-height:1.6;">
                    현재 점수 <b>${riskScore}%</b>는 <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${riskProfile.tone};color:#ffffff;font-size:12px;font-weight:700;">${riskProfile.level}</span> 구간입니다.
                  </div>
                  <div style="margin-top:10px;font-size:13px;color:#93370d;line-height:1.6;">${escapeHtml(riskProfile.meaning)}</div>
                  <div style="margin-top:6px;font-size:13px;color:#93370d;line-height:1.6;">주의: ${escapeHtml(riskProfile.caution)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 22px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};overflow:hidden;">
              <tr style="background:#f9fafb;">
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">리스크 범위</th>
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">해석</th>
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">주의 행동</th>
              </tr>
              ${renderRiskBandRows(riskScore)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 22px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff7ed;border:1px solid #fed7aa;border-radius:${CARD_RADIUS};">
              <tr><td style="padding:16px;">
                <div style="font-size:15px;color:#9a3412;font-weight:800;margin-bottom:8px;">핵심 요약</div>
                <div style="font-size:14px;color:#7c2d12;line-height:1.7;">${nlToBr(result?.summary)}</div>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 22px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" style="padding-right:7px;vertical-align:top;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ecfdf3;border:1px solid #abefc6;border-radius:${CARD_RADIUS};">
                    <tr><td style="padding:16px;">
                      <div style="font-size:15px;font-weight:800;color:#027a48;margin-bottom:8px;">좋은 흐름</div>
                      <div style="font-size:14px;color:#05603a;line-height:1.65;">${nlToBr(result?.highlight)}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding-left:7px;vertical-align:top;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff7ed;border:1px solid #fedf89;border-radius:${CARD_RADIUS};">
                    <tr><td style="padding:16px;">
                      <div style="font-size:15px;font-weight:800;color:#b54708;margin-bottom:8px;">주의 포인트</div>
                      <div style="font-size:14px;color:#93370d;line-height:1.65;">${nlToBr(result?.caution)}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 22px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f5f8ff;border:1px solid #d1e0ff;border-radius:${CARD_RADIUS};">
              <tr><td style="padding:16px;">
                <div style="font-size:15px;font-weight:800;color:#1849a9;margin-bottom:8px;">타이밍 힌트</div>
                <div style="font-size:14px;color:#1d2939;line-height:1.65;">${nlToBr(result?.timingHint)}</div>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px 0;">
            <div style="font-size:16px;color:#101828;font-weight:800;margin-bottom:8px;">핵심 연도</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};overflow:hidden;">
              <tr style="background:#f9fafb;">
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">연도</th>
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">연애 기회</th>
                <th align="left" style="padding:12px 10px;font-size:12px;color:#475467;">갈등 리스크</th>
              </tr>
              ${topYearsRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px 0;">
            <div style="font-size:16px;color:#101828;font-weight:800;margin-bottom:8px;">연도별 실행 가이드</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};">
              <tr><td style="padding:0 16px;">${yearlyRows || '<div style="padding:14px 0;font-size:13px;color:#667085;">연도별 가이드 데이터가 없습니다.</div>'}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px 0;">
            <div style="font-size:16px;color:#101828;font-weight:800;margin-bottom:8px;">상세 리포트</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              ${sectionBlocks}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 22px 22px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f9fafb;border:1px solid #eaecf0;border-radius:${CARD_RADIUS};">
              <tr><td style="padding:14px 16px;">
                <div style="font-size:12px;color:#475467;line-height:1.6;">
                  모델: ${escapeHtml(result?.modelVersion)} · 신뢰도 ${ratioToPercent(result?.confidence)}%
                </div>
                ${evidenceHtml}
                <div style="font-size:12px;color:#667085;line-height:1.6;margin-top:8px;">
                  본 결과는 참고용 콘텐츠이며, 실제 관계의 핵심은 상호 존중과 대화입니다.
                </div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `;
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": toAsciiIdempotencyKey("codex-worker-love", job.id),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "[사주 결과] 요청하신 연애운 리포트",
      text: createEmailText(job, result, name),
      html: createEmailHtml(job, result, name),
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

function createAdminSummaryText(job, status, errorMessage, result) {
  const statusLabel = status === "completed" ? "성공" : "실패";
  const scoreText = result
    ? `연애 ${clampPercent(result?.loveScore)} / 결혼 ${clampPercent(result?.marriageScore)} / 리스크 ${clampPercent(result?.riskScore)}`
    : "점수 없음";

  return [
    `[관리자 요약] 사주 처리 ${statusLabel}`,
    `요청 ID: ${job.id}`,
    `이름: ${job?.input?.name || "(미입력)"}`,
    `신청 이메일: ${job?.input?.email || "(없음)"}`,
    `처리 경로: worker`,
    `결과 상태: ${statusLabel}`,
    `점수: ${scoreText}`,
    `오류: ${errorMessage ?? "없음"}`,
    `모델 버전: ${result?.modelVersion ?? "-"}`,
  ].join("\n");
}

function createAdminSummaryHtml(job, status, errorMessage, result) {
  const statusLabel = status === "completed" ? "성공" : "실패";
  const statusColor = status === "completed" ? "#027a48" : "#b42318";
  const scoreText = result
    ? `${clampPercent(result?.loveScore)} / ${clampPercent(result?.marriageScore)} / ${clampPercent(result?.riskScore)}`
    : "-";

  return `
  <div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height: 1.55; color: #111827;">
    <h2 style="margin:0 0 12px;">[관리자 요약] 사주 처리 ${statusLabel}</h2>
    <p style="margin:0 0 8px;">요청 ID: <b>${escapeHtml(job.id)}</b></p>
    <p style="margin:0 0 8px;">이름: <b>${escapeHtml(job?.input?.name || "(미입력)")}</b></p>
    <p style="margin:0 0 8px;">신청 이메일: <b>${escapeHtml(job?.input?.email || "(없음)")}</b></p>
    <p style="margin:0 0 8px;">처리 경로: <b>worker</b></p>
    <p style="margin:0 0 8px;">결과 상태: <b style="color:${statusColor};">${statusLabel}</b></p>
    <p style="margin:0 0 8px;">점수(연애/결혼/리스크): <b>${scoreText}</b></p>
    <p style="margin:0 0 8px;">오류: <b>${escapeHtml(errorMessage ?? "없음")}</b></p>
    <p style="margin:0 0 8px;">모델 버전: <b>${escapeHtml(result?.modelVersion ?? "-")}</b></p>
  </div>`;
}

async function sendAdminSummaryEmail(job, status, errorMessage, result) {
  const mode = process.env.EMAIL_PROVIDER ?? (process.env.RESEND_API_KEY ? "resend" : "console");

  if (mode !== "resend") {
    log("info", "admin_email_console_preview", {
      adminTo: ADMIN_NOTIFY_EMAIL,
      requestId: job.id,
      status,
      requesterName: job?.input?.name || "",
      requesterEmail: job?.input?.email || "",
      error: errorMessage ?? null,
      source: "worker",
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": toAsciiIdempotencyKey("codex-worker-admin", `${job.id}:${status}`),
    },
    body: JSON.stringify({
      from,
      to: [ADMIN_NOTIFY_EMAIL],
      subject: `[관리자] ${job.id} ${status === "completed" ? "성공" : "실패"}`,
      text: createAdminSummaryText(job, status, errorMessage, result),
      html: createAdminSummaryHtml(job, status, errorMessage, result),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.message ?? "resend_admin_summary_failed");
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
    const baseline = await buildEngineBaseline(job);
    result = await runCodexReport(job, baseline, model, execTimeoutSec);
    const email = await sendResultEmail(job, result);
    await completeJob(db, job, result, email);
    try {
      await sendAdminSummaryEmail(job, "completed", null, result);
    } catch (notifyError) {
      log("warn", "admin_summary_email_failed", {
        jobId: job.id,
        source: "worker",
        message: notifyError instanceof Error ? notifyError.message : "unknown",
      });
    }
    log("info", "job_completed", {
      jobId: job.id,
      provider: email.provider,
      messageId: email.messageId,
    });
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_failed";
    await failJob(db, job, message);
    try {
      await sendAdminSummaryEmail(job, "failed", message, result);
    } catch (notifyError) {
      log("warn", "admin_summary_email_failed", {
        jobId: job.id,
        source: "worker",
        message: notifyError instanceof Error ? notifyError.message : "unknown",
      });
    }
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
