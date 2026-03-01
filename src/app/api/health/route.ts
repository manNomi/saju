import { NextResponse } from "next/server";
import { getFirestoreBackendMode } from "@/lib/server/firestore-repo";

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    firestoreMode: getFirestoreBackendMode(),
    paymentMode: process.env.TOSS_SECRET_KEY ? "toss" : "mock",
    captchaEnabled: Boolean(process.env.TURNSTILE_SECRET_KEY),
  });
}
