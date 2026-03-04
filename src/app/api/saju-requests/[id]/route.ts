import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedLoveJob, sanitizeLoveJob } from "@/lib/server/love-job-service";
import { logEvent } from "@/lib/server/monitoring";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return NextResponse.json({ error: "조회 키(token)가 필요해요." }, { status: 400 });
  }

  try {
    const job = await getAuthorizedLoveJob(id, token);
    if (!job) {
      return NextResponse.json({ error: "요청 정보를 찾지 못했어요." }, { status: 404 });
    }

    return NextResponse.json({ request: sanitizeLoveJob(job) });
  } catch (error) {
    if (error instanceof Error && error.message === "job_access_denied") {
      return NextResponse.json({ error: "조회 권한이 없어요. 요청 ID/조회 키를 확인해 주세요." }, { status: 403 });
    }

    logEvent("error", "saju_request_get_failed", {
      requestId: id,
      message: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json({ error: "결과 조회 중 오류가 발생했어요." }, { status: 500 });
  }
}
