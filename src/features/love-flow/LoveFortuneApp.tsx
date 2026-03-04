"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton, Text, TextField } from "@seed-design/react";
import {
  clearActiveLoveJob,
  getActiveLoveJob,
  getJobToken,
  saveJobToken,
  setActiveLoveJob,
} from "@/lib/love-client-storage";
import {
  createLoveJobRequest,
  getLoveJobRequest,
  logClientEvent,
  triggerJobProcessorRequest,
} from "@/lib/love-api-client";
import { type LoveJobInput, type LoveJobPublic, type LoveJobResult } from "@/lib/love-job-types";

declare global {
  interface Window {
    turnstile?: {
      render: (selector: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Step = "landing" | "input" | "pending" | "result";

type SajuInput = LoveJobInput;
type ResultPayload = LoveJobResult;

const DEFAULT_INPUT: SajuInput = {
  name: "",
  email: "",
  gender: "female",
  calendarType: "solar",
  birthDate: "",
  birthTime: "",
  birthPlace: "대한민국",
};

const cardClassName =
  "rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card";

function CarrotBuddy({ label }: { label: string }) {
  return (
    <div className="mx-auto grid h-[120px] w-[120px] animate-floating place-items-center rounded-[30px] bg-seed-bg-brand-weak">
      <Image src="/carrot-buddy.svg" alt={label} width={120} height={120} priority />
    </div>
  );
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[430px] px-4 pb-[calc(var(--seed-safe-area-bottom)+16px)] pt-5">
      {children}
    </main>
  );
}

function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="mx-auto flex h-12 w-full max-w-[430px] items-center px-4 text-seed-fg-primary">
      <button
        type="button"
        onClick={onBack}
        className="h-9 w-9 rounded-full border border-seed-stroke-subtle text-lg disabled:opacity-0"
        disabled={!onBack}
        aria-label="뒤로가기"
      >
        ←
      </button>
      <p className="flex-1 text-center text-[15px] font-semibold">{title}</p>
      <div className="h-9 w-9" />
    </header>
  );
}

function parseJobFromUrl() {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const rid = url.searchParams.get("rid")?.trim();
  const token = url.searchParams.get("token")?.trim();

  if (!rid || !token) return null;
  return { rid, token };
}

function syncJobToUrl(jobId: string | null, accessToken: string | null) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);

  if (jobId && accessToken) {
    url.searchParams.set("rid", jobId);
    url.searchParams.set("token", accessToken);
  } else {
    url.searchParams.delete("rid");
    url.searchParams.delete("token");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function legalLinkClass() {
  return "text-[11px] text-seed-fg-subtle underline underline-offset-2";
}

export default function LoveFortuneApp() {
  const [step, setStep] = useState<Step>("landing");
  const [form, setForm] = useState<SajuInput>(DEFAULT_INPUT);
  const [error, setError] = useState("");
  const [job, setJob] = useState<LoveJobPublic | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [copied, setCopied] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const customerName = useMemo(() => form.name || "고객님", [form.name]);
  const localProcessAssist = process.env.NEXT_PUBLIC_LOCAL_PROCESS_ASSIST === "true";

  const applyJobState = useCallback((nextJob: LoveJobPublic, token: string) => {
    setJob(nextJob);
    setLookupId(nextJob.id);
    setLookupToken(token);
    setAccessToken(token);
    setForm(nextJob.input);
    setActiveLoveJob(nextJob.id, token);
    syncJobToUrl(nextJob.id, token);

    if (nextJob.status === "completed" && nextJob.result) {
      setResult(nextJob.result);
      setStep("result");
      setError("");
      return;
    }

    if (nextJob.status === "failed") {
      setResult(nextJob.result);
      setStep("input");
      setError(nextJob.error ?? "분석 작업이 실패했어요. 다시 요청해 주세요.");
      return;
    }

    setResult(null);
    setStep("pending");
    setError("");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const fromUrl = parseJobFromUrl();
      const active = getActiveLoveJob();
      const target = fromUrl
        ? { jobId: fromUrl.rid, token: fromUrl.token }
        : active
          ? { jobId: active.jobId, token: active.accessToken }
          : null;

      if (!target || cancelled) return;

      try {
        const loaded = await getLoveJobRequest(target.jobId, target.token);
        if (cancelled) return;
        applyJobState(loaded.job, target.token);
      } catch {
        if (!cancelled) {
          clearActiveLoveJob();
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyJobState]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
    if (typeof window === "undefined") return;

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-turnstile='1']");

    const render = () => {
      if (!window.turnstile) return;

      window.turnstile.render("#turnstile-widget", {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token: string) => setCaptchaToken(token),
        "error-callback": () => setCaptchaToken(""),
        "expired-callback": () => setCaptchaToken(""),
        theme: "auto",
        language: "ko",
      });
    };

    if (existingScript) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "1";
    script.onload = () => render();
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (step !== "pending" || !job || !accessToken) return;

    let cancelled = false;

    const tick = async () => {
      if (localProcessAssist) {
        try {
          await triggerJobProcessorRequest();
        } catch {
          // best-effort local assist
        }
      }

      try {
        const loaded = await getLoveJobRequest(job.id, accessToken);
        if (cancelled) return;
        applyJobState(loaded.job, accessToken);
      } catch {
        if (!cancelled) {
          setError("상태 조회에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, job, accessToken, applyJobState, localProcessAssist]);

  const updateField = <K extends keyof SajuInput>(key: K, value: SajuInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!form.birthDate) {
      setError("생년월일은 꼭 입력해 주세요.");
      return;
    }

    if (!form.email) {
      setError("결과를 받을 이메일을 입력해 주세요.");
      return;
    }

    setError("");

    try {
      const created = await createLoveJobRequest(form, captchaToken || undefined);
      await logClientEvent({ event: "job_submit", jobId: created.job.id });
      applyJobState(created.job, created.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 생성에 실패했어요.");
    }
  };

  const loadById = async () => {
    const normalized = lookupId.trim();
    const normalizedToken = lookupToken.trim() || getJobToken(normalized) || "";

    if (!normalized) {
      setLookupError("요청 ID를 입력해 주세요.");
      return;
    }

    if (!normalizedToken) {
      setLookupError("조회 키를 입력해 주세요. (같은 브라우저라면 자동으로 채워져요)");
      return;
    }

    try {
      const loaded = await getLoveJobRequest(normalized, normalizedToken);
      setLookupError("");
      saveJobToken(normalized, normalizedToken);
      applyJobState(loaded.job, normalizedToken);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "해당 ID 결과를 찾지 못했어요.");
    }
  };

  const copyResultLink = async () => {
    if (!job || !accessToken || typeof window === "undefined" || !navigator?.clipboard) return;

    const url = `${window.location.origin}/?rid=${encodeURIComponent(job.id)}&token=${encodeURIComponent(accessToken)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_6%_4%,var(--seed-color-bg-brand-weak),transparent_34%),radial-gradient(circle_at_96%_2%,var(--seed-color-bg-brand-weak),transparent_28%),var(--seed-color-bg-layer-fill)]">
      {step === "landing" && (
        <ScreenFrame>
          <section className="relative overflow-hidden rounded-[32px] border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-seed-bg-brand-weak/80" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-seed-bg-brand-weak/70" />

            <p className="inline-flex rounded-full border border-[var(--seed-color-stroke-brand)]/40 bg-seed-bg-brand-weak px-3 py-1 text-[12px] font-semibold text-[var(--seed-color-fg-brand)]">
              490원 연애운 리포트
            </p>

            <CarrotBuddy label="연애운 캐릭터" />

            <Text
              as="h1"
              className="mt-2 block text-[31px] font-black leading-[1.15] tracking-[-0.03em] text-seed-fg-primary"
            >
              오늘의 연애 흐름
              <br />
              가볍게 확인해요
            </Text>
            <Text as="p" className="mt-3 block text-[15px] leading-[1.55] text-seed-fg-muted">
              논문·명리 규칙 기반 리포트를 자동 생성해요.
              <br />
              지금은 서버비 기준으로 490원만 받아요.
            </Text>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <p className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-2 text-center text-[12px] font-medium text-seed-fg-primary">
                무로그인
              </p>
              <p className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-2 text-center text-[12px] font-medium text-seed-fg-primary">
                1분 입력
              </p>
              <p className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-2 text-center text-[12px] font-medium text-seed-fg-primary">
                이메일 결과
              </p>
            </div>

            <ActionButton
              variant="brandSolid"
              size="large"
              className="mt-5 w-full"
              onClick={() => setStep("input")}
            >
              490원으로 시작하기
            </ActionButton>
          </section>

          <section className="mt-4 rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-4 shadow-card">
            <p className="text-[13px] font-bold text-seed-fg-primary">요청 ID로 결과 이어보기</p>
            <TextField.Root className="mt-2 bg-seed-bg-default">
              <TextField.Input
                aria-label="요청 ID"
                placeholder="요청 ID"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
              />
            </TextField.Root>
            <TextField.Root className="mt-2 bg-seed-bg-default">
              <TextField.Input
                aria-label="조회 키"
                placeholder="조회 키(선택, 같은 브라우저면 자동)"
                value={lookupToken}
                onChange={(e) => setLookupToken(e.target.value)}
              />
            </TextField.Root>
            {lookupError ? (
              <p className="mt-2 text-xs text-[var(--seed-color-fg-critical)]">{lookupError}</p>
            ) : null}
            <ActionButton variant="neutralWeak" size="medium" className="mt-2 w-full" onClick={loadById}>
              결과 조회
            </ActionButton>
          </section>

          <div className="mt-4 flex items-center justify-center gap-3">
            <Link className={legalLinkClass()} href="/privacy">
              개인정보 처리방침
            </Link>
            <Link className={legalLinkClass()} href="/refund">
              환불 정책
            </Link>
            <Link className={legalLinkClass()} href="/disclaimer">
              이용 안내
            </Link>
          </div>
        </ScreenFrame>
      )}

      {step === "input" && (
        <>
          <TopBar title="사주 정보 입력" onBack={() => setStep("landing")} />
          <ScreenFrame>
            <section className={cardClassName}>
              <Text as="p" className="mb-4 block text-sm leading-[1.45] text-seed-fg-muted">
                입력 후 자동화 작업이 실행되며, 결과를 이메일로 발송합니다.
              </Text>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">이름 (선택)</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="홍길동"
                />
              </TextField.Root>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">이메일</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </TextField.Root>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">생년월일</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => updateField("birthDate", e.target.value)}
                />
              </TextField.Root>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">출생 시간 (선택)</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  type="time"
                  value={form.birthTime}
                  onChange={(e) => updateField("birthTime", e.target.value)}
                />
              </TextField.Root>

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-2 block text-[13px] font-bold text-seed-fg-primary">성별</label>
                  <select
                    className="h-11 w-full rounded-2xl border border-seed-stroke-subtle bg-seed-bg-default px-3 text-[14px] text-seed-fg-primary"
                    value={form.gender}
                    onChange={(e) => updateField("gender", e.target.value as SajuInput["gender"])}
                  >
                    <option value="female">여성</option>
                    <option value="male">남성</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-[13px] font-bold text-seed-fg-primary">달력</label>
                  <select
                    className="h-11 w-full rounded-2xl border border-seed-stroke-subtle bg-seed-bg-default px-3 text-[14px] text-seed-fg-primary"
                    value={form.calendarType}
                    onChange={(e) => updateField("calendarType", e.target.value as SajuInput["calendarType"])}
                  >
                    <option value="solar">양력</option>
                    <option value="lunar">음력</option>
                  </select>
                </div>
              </div>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">출생지 (선택)</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  value={form.birthPlace}
                  onChange={(e) => updateField("birthPlace", e.target.value)}
                  placeholder="서울"
                />
              </TextField.Root>

              {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
                <div id="turnstile-widget" className="mt-3 min-h-[64px]" />
              ) : null}

              {error ? <p className="mt-3 text-[13px] text-[var(--seed-color-fg-critical)]">{error}</p> : null}

              <ActionButton variant="brandSolid" size="large" className="mt-4 w-full" onClick={submit}>
                요청 등록하기
              </ActionButton>
            </section>
          </ScreenFrame>
        </>
      )}

      {step === "pending" && (
        <>
          <TopBar title="분석 대기" onBack={() => setStep("input")} />
          <ScreenFrame>
            <section className={`${cardClassName} text-center`}>
              <CarrotBuddy label="분석 진행 캐릭터" />
              <Text as="h2" className="mt-1 block text-[24px] font-black leading-[1.25] text-seed-fg-primary">
                자동 분석을 진행 중이에요
              </Text>
              <Text as="p" className="mt-2 block text-sm leading-[1.45] text-seed-fg-muted">
                Codex Automation이 큐 작업을 처리하면 이메일과 화면에서 결과를 확인할 수 있어요.
              </Text>
              {job ? (
                <p className="mt-2 text-xs text-seed-fg-subtle">
                  요청 ID: <b className="text-seed-fg-primary">{job.id}</b>
                </p>
              ) : null}
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-seed-bg-fill">
                <span className="block h-full w-[35%] animate-loading rounded-full bg-seed-bg-brand" />
              </div>
            </section>
          </ScreenFrame>
        </>
      )}

      {step === "result" && result && job && (
        <>
          <TopBar title="연애운 결과" onBack={() => setStep("input")} />
          <ScreenFrame>
            <section className={`${cardClassName} text-center`}>
              <CarrotBuddy label="결과 캐릭터" />
              <Text as="h2" className="mt-1 block text-[24px] font-black leading-[1.25] text-seed-fg-primary">
                {customerName}의 연애 리포트
              </Text>

              <div className="mt-3 flex items-center justify-center gap-2">
                <p className="rounded-full border border-seed-stroke-subtle bg-seed-bg-fill px-3 py-1 text-xs text-seed-fg-muted">
                  요청 ID: <b className="text-seed-fg-primary">{job.id}</b>
                </p>
                <ActionButton variant="neutralWeak" size="small" onClick={copyResultLink}>
                  {copied ? "복사됨" : "링크 복사"}
                </ActionButton>
              </div>

              <p className="mt-2 text-xs text-seed-fg-muted">
                이메일 발송: {job.email.sent ? "완료" : "대기/실패"}
                {job.email.error ? ` (${job.email.error})` : ""}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                  <span className="block text-xs text-seed-fg-subtle">연애 점수</span>
                  <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">{result.loveScore}점</strong>
                </article>
                <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                  <span className="block text-xs text-seed-fg-subtle">결혼 전환</span>
                  <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">
                    {result.marriageScore}점
                  </strong>
                </article>
                <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                  <span className="block text-xs text-seed-fg-subtle">리스크</span>
                  <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">{result.riskScore}점</strong>
                </article>
              </div>

              <div className="mt-3 rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-3 py-2 text-left text-xs text-seed-fg-muted">
                <p>
                  <b className="text-seed-fg-primary">모델 신뢰도:</b> {Math.round(result.confidence * 100)}%
                </p>
                <p className="mt-1">
                  <b className="text-seed-fg-primary">우세 오행:</b> {result.dominantElement} /{" "}
                  <b className="text-seed-fg-primary">보완 오행:</b> {result.weakestElement}
                </p>
              </div>

              <div className="mt-4 grid gap-2 text-left text-sm leading-[1.45] text-seed-fg-muted">
                <p>
                  <b className="text-seed-fg-primary">핵심 요약:</b> {result.summary}
                </p>
                <p>
                  <b className="text-seed-fg-primary">좋은 흐름:</b> {result.highlight}
                </p>
                <p>
                  <b className="text-seed-fg-primary">주의 포인트:</b> {result.caution}
                </p>
                <p>
                  <b className="text-seed-fg-primary">타이밍 힌트:</b> {result.timingHint}
                </p>
              </div>

              {result.topYears.length > 0 && (
                <div className="mt-3 rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-3 py-3 text-left">
                  <p className="text-xs font-semibold text-seed-fg-primary">추천 타이밍 TOP 3</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-seed-fg-muted">
                    {result.topYears.map((row) => (
                      <li key={row.year}>
                        {row.year}년 · 기대 {Math.round(row.loveChance * 100)}% · 리스크{" "}
                        {Math.round(row.breakupRisk * 100)}%
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.evidenceCodes.length > 0 && (
                <p className="mt-3 text-left text-[11px] text-seed-fg-subtle">
                  근거코드: {result.evidenceCodes.join(", ")}
                </p>
              )}

              <ActionButton
                variant="brandSolid"
                size="large"
                className="mt-4 w-full"
                onClick={() => setStep("input")}
              >
                다시 분석하기
              </ActionButton>
            </section>
          </ScreenFrame>
        </>
      )}
    </div>
  );
}
