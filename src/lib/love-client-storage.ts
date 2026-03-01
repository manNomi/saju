const ACTIVE_JOB_KEY = "saju_love_active_job_v2";
const JOB_TOKEN_MAP_KEY = "saju_love_token_map_v2";

type ActiveJob = {
  jobId: string;
  accessToken: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readTokenMap(): Record<string, string> {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(JOB_TOKEN_MAP_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

function writeTokenMap(map: Record<string, string>) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(JOB_TOKEN_MAP_KEY, JSON.stringify(map));
}

export function saveJobToken(jobId: string, accessToken: string) {
  const map = readTokenMap();
  map[jobId] = accessToken;
  writeTokenMap(map);
}

export function getJobToken(jobId: string) {
  const map = readTokenMap();
  return map[jobId] ?? null;
}

export function setActiveLoveJob(jobId: string, accessToken: string) {
  if (!canUseStorage()) return;

  saveJobToken(jobId, accessToken);
  const payload: ActiveJob = { jobId, accessToken };
  window.localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(payload));
}

export function clearActiveLoveJob() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ACTIVE_JOB_KEY);
}

export function getActiveLoveJob(): ActiveJob | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveJob;
    if (!parsed?.jobId || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}
