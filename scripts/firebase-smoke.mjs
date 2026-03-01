const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "saju-65bf8";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const endpoint = new URL(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`,
);

if (apiKey) {
  endpoint.searchParams.set("key", apiKey);
}

console.log(`[firebase-smoke] projectId=${projectId}`);
console.log(
  `[firebase-smoke] endpoint=${endpoint.origin}${endpoint.pathname}${apiKey ? "?key=[REDACTED]" : ""}`,
);

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message ?? "Unknown error";
    console.error(`[firebase-smoke] FAIL (${response.status}) ${message}`);

    if (message.includes("SERVICE_DISABLED")) {
      console.error(
        "[firebase-smoke] Cloud Firestore API is disabled. Enable firestore.googleapis.com first.",
      );
    }

    if (message.includes("API key not valid")) {
      console.error("[firebase-smoke] API key is missing/invalid. Set NEXT_PUBLIC_FIREBASE_API_KEY.");
    }

    process.exit(1);
  }

  const ids = payload.collectionIds ?? [];
  console.log(`[firebase-smoke] OK. collectionIds=${JSON.stringify(ids)}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[firebase-smoke] ERROR ${message}`);
  process.exit(1);
}
