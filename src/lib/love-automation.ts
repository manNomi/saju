import { nanoid } from "nanoid";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { analyzeLoveFortune, toKoreanElementName } from "@/lib/saju-love-engine";
import { firestore, isFirebaseConfigured } from "@/lib/firebase-client";

export type LoveJobInput = {
  name: string;
  gender: "male" | "female";
  calendarType: "solar" | "lunar";
  birthDate: string;
  birthTime: string;
  birthPlace: string;
};

export type LoveJobResult = {
  loveScore: number;
  marriageScore: number;
  riskScore: number;
  confidence: number;
  dominantElement: string;
  weakestElement: string;
  topYears: Array<{ year: number; loveChance: number; breakupRisk: number }>;
  evidenceCodes: string[];
  summary: string;
  highlight: string;
  caution: string;
  timingHint: string;
};

export type LoveJobStatus = "pending" | "completed" | "failed";

export type LoveJob = {
  id: string;
  status: LoveJobStatus;
  input: LoveJobInput;
  result: LoveJobResult | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

const JOBS_KEY = "saju_love_jobs_v1";
const ACTIVE_JOB_KEY = "saju_love_active_job_id_v1";
const PROCESSING_DELAY_MS = 2400;
const COLLECTION_NAME = "loveJobs";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJobsLocal(): Record<string, LoveJob> {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(JOBS_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as Record<string, LoveJob>) ?? {};
  } catch {
    return {};
  }
}

function writeJobsLocal(jobs: Record<string, LoveJob>) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

export function setActiveLoveJobId(id: string | null) {
  if (!canUseStorage()) return;

  if (!id) {
    window.localStorage.removeItem(ACTIVE_JOB_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_JOB_KEY, id);
}

export function getActiveLoveJobId() {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACTIVE_JOB_KEY);
}

function buildLoveResult(input: LoveJobInput): LoveJobResult {
  const analysis = analyzeLoveFortune({
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    gender: input.gender,
    calendarType: input.calendarType,
    birthPlace: input.birthPlace,
  });

  return {
    loveScore: analysis.loveScore,
    marriageScore: analysis.marriageScore,
    riskScore: analysis.riskScore,
    confidence: analysis.confidence,
    dominantElement: toKoreanElementName(analysis.elementProfile.dominant),
    weakestElement: toKoreanElementName(analysis.elementProfile.weakest),
    topYears: analysis.topYears.map((year) => ({
      year: year.year,
      loveChance: year.loveChance,
      breakupRisk: year.breakupRisk,
    })),
    evidenceCodes: analysis.evidenceCodes,
    summary: analysis.summary,
    highlight: analysis.highlight,
    caution: analysis.caution,
    timingHint: analysis.timingHint,
  };
}

async function getLoveJobRemote(jobId: string) {
  if (!firestore || !isFirebaseConfigured) return null;

  const snap = await getDoc(doc(firestore, COLLECTION_NAME, jobId));
  if (!snap.exists()) return null;

  return snap.data() as LoveJob;
}

async function getLoveJobLocal(jobId: string) {
  const jobs = readJobsLocal();
  return jobs[jobId] ?? null;
}

export async function getLoveJob(jobId: string) {
  if (isFirebaseConfigured && firestore) {
    return getLoveJobRemote(jobId);
  }

  return getLoveJobLocal(jobId);
}

async function createLoveJobRemote(input: LoveJobInput) {
  if (!firestore || !isFirebaseConfigured) {
    throw new Error("firebase_not_configured");
  }

  const id = nanoid(20);
  const now = Date.now();

  const job: LoveJob = {
    id,
    status: "pending",
    input,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(firestore, COLLECTION_NAME, id), job);
  setActiveLoveJobId(id);

  return job;
}

function createLoveJobLocal(input: LoveJobInput) {
  const jobs = readJobsLocal();
  const id = nanoid(12);
  const now = Date.now();

  const job: LoveJob = {
    id,
    status: "pending",
    input,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  jobs[id] = job;
  writeJobsLocal(jobs);
  setActiveLoveJobId(id);

  return job;
}

export async function createLoveJob(input: LoveJobInput) {
  if (isFirebaseConfigured && firestore) {
    return createLoveJobRemote(input);
  }

  return createLoveJobLocal(input);
}

async function completeRemoteJob(job: LoveJob, now: number) {
  if (!firestore) return;

  try {
    const result = buildLoveResult(job.input);
    await updateDoc(doc(firestore, COLLECTION_NAME, job.id), {
      status: "completed",
      result,
      updatedAt: now,
      error: null,
    });
  } catch (error) {
    await updateDoc(doc(firestore, COLLECTION_NAME, job.id), {
      status: "failed",
      updatedAt: now,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

function completeLocalJob(job: LoveJob, now: number) {
  const jobs = readJobsLocal();
  const target = jobs[job.id];
  if (!target) return;

  try {
    target.status = "completed";
    target.result = buildLoveResult(target.input);
    target.error = null;
    target.updatedAt = now;
  } catch (error) {
    target.status = "failed";
    target.error = error instanceof Error ? error.message : "unknown_error";
    target.updatedAt = now;
  }

  jobs[target.id] = target;
  writeJobsLocal(jobs);
}

export async function runLoveAutomationForJob(jobId: string, now = Date.now()) {
  const job = await getLoveJob(jobId);
  if (!job || job.status !== "pending") return;

  if (now - job.createdAt < PROCESSING_DELAY_MS) return;

  if (isFirebaseConfigured && firestore) {
    await completeRemoteJob(job, now);
    return;
  }

  completeLocalJob(job, now);
}

export async function runLoveAutomation(now = Date.now()) {
  if (isFirebaseConfigured && firestore) return;

  const jobs = readJobsLocal();
  Object.values(jobs)
    .filter((job) => job.status === "pending" && now - job.createdAt >= PROCESSING_DELAY_MS)
    .forEach((job) => completeLocalJob(job, now));
}

export async function resolveLoveJob(jobId: string) {
  await runLoveAutomationForJob(jobId);
  return getLoveJob(jobId);
}
