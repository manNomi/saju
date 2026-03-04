import { NextResponse } from "next/server";
import { getFirestoreBackendMode } from "@/lib/server/firestore-repo";

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    firestoreMode: getFirestoreBackendMode(),
    emailMode: process.env.RESEND_API_KEY ? "resend" : "console",
    captchaEnabled: Boolean(process.env.TURNSTILE_SECRET_KEY),
  });
}
