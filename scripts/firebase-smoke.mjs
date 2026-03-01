const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "saju-65bf8";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const smokeId = `smoke-${Date.now()}`;
const endpoint = new URL(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/loveJobs/${smokeId}`,
);

console.log(`[firebase-smoke] projectId=${projectId}`);
console.log(
  `[firebase-smoke] endpoint=${endpoint.origin}${endpoint.pathname}${apiKey ? "?key=[REDACTED]" : ""}`,
);

try {
  if (!apiKey) {
    console.error("[firebase-smoke] FAIL Missing NEXT_PUBLIC_FIREBASE_API_KEY.");
    process.exit(1);
  }

  endpoint.searchParams.set("key", apiKey);

  const now = Date.now();
  const createBody = {
    fields: {
      id: { stringValue: smokeId },
      status: { stringValue: "pending" },
      createdAt: { integerValue: String(now) },
      updatedAt: { integerValue: String(now) },
      input: {
        mapValue: {
          fields: {
            name: { stringValue: "smoke" },
            gender: { stringValue: "female" },
            calendarType: { stringValue: "solar" },
            birthDate: { stringValue: "1990-01-01" },
            birthTime: { stringValue: "12:00" },
            birthPlace: { stringValue: "Seoul" },
          },
        },
      },
    },
  };

  const createResponse = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBody),
  });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    const message = createPayload?.error?.message ?? "Unknown error";
    console.error(`[firebase-smoke] FAIL create (${createResponse.status}) ${message}`);
    process.exit(1);
  }

  const readResponse = await fetch(endpoint);
  const readPayload = await readResponse.json().catch(() => ({}));
  if (!readResponse.ok) {
    const message = readPayload?.error?.message ?? "Unknown error";
    console.error(`[firebase-smoke] FAIL read (${readResponse.status}) ${message}`);
    process.exit(1);
  }

  const deleteResponse = await fetch(endpoint, { method: "DELETE" });
  const deletePayload = await deleteResponse.json().catch(() => ({}));
  if (!deleteResponse.ok) {
    const message = deletePayload?.error?.message ?? "Unknown error";
    console.error(`[firebase-smoke] FAIL delete (${deleteResponse.status}) ${message}`);
    process.exit(1);
  }

  console.log("[firebase-smoke] OK. write/read/delete passed for loveJobs.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[firebase-smoke] ERROR ${message}`);
  process.exit(1);
}
