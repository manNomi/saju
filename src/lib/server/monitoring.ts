type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, detail: Record<string, unknown> = {}) {
  const payload = {
    level,
    event,
    detail,
    ts: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);

  if (level === "error") {
    console.error(body);
    return;
  }

  if (level === "warn") {
    console.warn(body);
    return;
  }

  console.info(body);
}
