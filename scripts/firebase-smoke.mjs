const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

function log(msg) {
  console.log(`[app-smoke] ${msg}`);
}

async function requestJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.error ?? body?.message ?? `HTTP ${response.status}`;
    throw new Error(`${path} -> ${message}`);
  }

  return body;
}

async function main() {
  log(`baseUrl=${baseUrl}`);

  const health = await requestJson("/api/health", { method: "GET" });
  log(`health ok (firestoreMode=${health.firestoreMode}, paymentMode=${health.paymentMode})`);

  const created = await requestJson("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        name: "smoke",
        gender: "female",
        calendarType: "solar",
        birthDate: "1992-05-12",
        birthTime: "09:30",
        birthPlace: "Seoul",
      },
    }),
  });

  const { job, accessToken } = created;
  log(`job created id=${job.id}`);

  const loaded = await requestJson(
    `/api/jobs/${encodeURIComponent(job.id)}?token=${encodeURIComponent(accessToken)}`,
    { method: "GET", cache: "no-store" },
  );

  if (loaded.job?.status !== "awaiting_payment") {
    throw new Error(`unexpected status: ${loaded.job?.status ?? "unknown"}`);
  }

  log("pre-payment flow OK (awaiting_payment)");
  log("OK");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[app-smoke] FAIL ${message}`);
  process.exit(1);
});
