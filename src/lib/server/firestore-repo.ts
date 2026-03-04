import {
  applicationDefault,
  cert,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import {
  getFirestore as getAdminFirestore,
  type Firestore as AdminFirestore,
} from "firebase-admin/firestore";
import { getApps as getClientApps, initializeApp as initializeClientApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore as getClientFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore as ClientFirestore,
} from "firebase/firestore";
import { LOVE_JOBS_COLLECTION, type LoveJob } from "@/lib/love-job-types";

type Backend =
  | {
      mode: "admin";
      db: AdminFirestore;
    }
  | {
      mode: "client";
      db: ClientFirestore;
    };

let backendCache: Backend | null = null;

function createAdminBackend(): Backend | null {
  try {
    const hasExplicitAdminEnv = Boolean(
      process.env.FIREBASE_ADMIN_PROJECT_ID &&
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    );
    const hasGoogleCredentialsFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

    if (!hasExplicitAdminEnv && !hasGoogleCredentialsFile) {
      return null;
    }

    if (!getAdminApps().length) {
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

      if (hasExplicitAdminEnv && projectId && clientEmail && privateKey) {
        initializeAdminApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        initializeAdminApp({
          credential: applicationDefault(),
        });
      }
    }

    return {
      mode: "admin",
      db: getAdminFirestore(),
    };
  } catch {
    return null;
  }
}

function createClientFallbackBackend(): Backend | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  if (!getClientApps().length) {
    initializeClientApp({
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    });
  }

  return {
    mode: "client",
    db: getClientFirestore(),
  };
}

function resolveBackend(): Backend {
  if (backendCache) return backendCache;

  const adminBackend = createAdminBackend();
  if (adminBackend) {
    backendCache = adminBackend;
    return adminBackend;
  }

  const allowFallback =
    process.env.FIREBASE_SERVER_FALLBACK_PUBLIC === "true" || process.env.NODE_ENV !== "production";
  if (!allowFallback) {
    throw new Error("firestore_admin_not_configured");
  }

  const fallback = createClientFallbackBackend();
  if (!fallback) {
    throw new Error("firestore_fallback_not_configured");
  }

  backendCache = fallback;
  return fallback;
}

export function getFirestoreBackendMode() {
  return resolveBackend().mode;
}

export async function createLoveJob(job: LoveJob) {
  const backend = resolveBackend();

  if (backend.mode === "admin") {
    await backend.db.collection(LOVE_JOBS_COLLECTION).doc(job.id).set(job);
    return;
  }

  await setDoc(doc(backend.db, LOVE_JOBS_COLLECTION, job.id), job);
}

export async function getLoveJobById(jobId: string): Promise<LoveJob | null> {
  const backend = resolveBackend();

  if (backend.mode === "admin") {
    const snap = await backend.db.collection(LOVE_JOBS_COLLECTION).doc(jobId).get();
    if (!snap.exists) return null;
    return snap.data() as LoveJob;
  }

  const snap = await getDoc(doc(backend.db, LOVE_JOBS_COLLECTION, jobId));
  if (!snap.exists()) return null;
  return snap.data() as LoveJob;
}

export async function updateLoveJob(jobId: string, patch: Partial<LoveJob>) {
  const backend = resolveBackend();

  if (backend.mode === "admin") {
    await backend.db.collection(LOVE_JOBS_COLLECTION).doc(jobId).update(patch);
    return;
  }

  await updateDoc(doc(backend.db, LOVE_JOBS_COLLECTION, jobId), patch as Record<string, unknown>);
}

export async function findProcessableLoveJobs(limitCount: number) {
  const backend = resolveBackend();

  if (backend.mode === "admin") {
    const snap = await backend.db
      .collection(LOVE_JOBS_COLLECTION)
      .where("status", "==", "queued")
      .limit(limitCount)
      .get();

    return snap.docs.map((row) => row.data() as LoveJob);
  }

  const q = query(
    collection(backend.db, LOVE_JOBS_COLLECTION),
    where("status", "==", "queued"),
    limit(limitCount),
  );

  const snap = await getDocs(q);
  return snap.docs.map((row) => row.data() as LoveJob);
}
