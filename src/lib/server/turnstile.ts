export async function verifyTurnstileToken(token: string | null, remoteIp: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { success: true, skipped: true };
  }

  if (!token) {
    return { success: false, skipped: false, error: "captcha_token_missing" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: remoteIp,
  });

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };

  if (!response.ok || !payload.success) {
    return {
      success: false,
      skipped: false,
      error: payload?.["error-codes"]?.join(",") ?? "captcha_verify_failed",
    };
  }

  return { success: true, skipped: false };
}
