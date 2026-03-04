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
  log(`health ok (firestoreMode=${health.firestoreMode}, emailMode=${health.emailMode})`);

  const created = await requestJson("/api/saju-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        name: "smoke",
        email: "smoke@example.com",
        gender: "female",
        calendarType: "solar",
        birthDate: "1992-05-12",
        birthTime: "09:30",
        birthPlace: "Seoul",
      },
    }),
  });

  const request = created.request;
  const accessToken = created.accessToken;
  log(`request created id=${request.id}`);

  await requestJson("/api/saju-requests/process", { method: "POST" });
  log("processor triggered");

  let loaded = await requestJson(
    `/api/saju-requests/${encodeURIComponent(request.id)}?token=${encodeURIComponent(accessToken)}`,
    { method: "GET", cache: "no-store" },
  );

  if (loaded.request?.status !== "completed") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    loaded = await requestJson(
      `/api/saju-requests/${encodeURIComponent(request.id)}?token=${encodeURIComponent(accessToken)}`,
      { method: "GET", cache: "no-store" },
    );
  }

  if (loaded.request?.status !== "completed") {
    throw new Error(`unexpected status: ${loaded.request?.status ?? "unknown"}`);
  }

  if (!loaded.request?.result) {
    throw new Error("result_missing");
  }

  if (!loaded.request?.email?.sent) {
    throw new Error(`email_not_sent(${loaded.request?.email?.error ?? "unknown"})`);
  }

  log(`result ready loveScore=${loaded.request.result.loveScore}`);
  log("OK");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[app-smoke] FAIL ${message}`);
  process.exit(1);
});
