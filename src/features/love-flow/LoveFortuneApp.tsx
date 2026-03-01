"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton, Text, TextField } from "@seed-design/react";
import {
  createLoveJob,
  getActiveLoveJobId,
  resolveLoveJob,
  runLoveAutomation,
  setActiveLoveJobId,
  type LoveJob,
  type LoveJobInput,
  type LoveJobResult,
} from "@/lib/love-automation";
import { usePricingExperiment } from "@/lib/pricing-experiment";

type Step = "landing" | "input" | "pending" | "result";

type SajuInput = LoveJobInput;
type ResultPayload = LoveJobResult;

const DEFAULT_INPUT: SajuInput = {
  name: "",
  gender: "female",
  calendarType: "solar",
  birthDate: "",
  birthTime: "",
  birthPlace: "대한민국",
};

const cardClassName =
  "rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card";
const UNLOCKED_RESULTS_KEY = "saju_love_unlocked_results_v1";

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

function parseRidFromUrl() {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const rid = url.searchParams.get("rid");
  return rid?.trim() ? rid.trim() : null;
}

function syncRidToUrl(rid: string | null) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (rid) {
    url.searchParams.set("rid", rid);
  } else {
    url.searchParams.delete("rid");
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function readUnlockedResults(): Record<string, true> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(UNLOCKED_RESULTS_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as Record<string, true>) ?? {};
  } catch {
    return {};
  }
}

function isJobUnlocked(jobId: string) {
  const unlocked = readUnlockedResults();
  return Boolean(unlocked[jobId]);
}

function markJobUnlocked(jobId: string) {
  if (typeof window === "undefined") return;

  const unlocked = readUnlockedResults();
  unlocked[jobId] = true;
  window.localStorage.setItem(UNLOCKED_RESULTS_KEY, JSON.stringify(unlocked));
}

export default function LoveFortuneApp() {
  const { variant: pricingVariant, source: pricingSource } = usePricingExperiment();
  const [step, setStep] = useState<Step>("landing");
  const [form, setForm] = useState<SajuInput>(DEFAULT_INPUT);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDetailUnlocked, setIsDetailUnlocked] = useState(false);

  const customerName = useMemo(() => form.name || "고객님", [form.name]);
  const isPaidOnlyVariant = pricingVariant === "paid_only";
  const showFullResult = isPaidOnlyVariant || isDetailUnlocked;

  const applyJobState = useCallback(
    (job: LoveJob) => {
      setJobId(job.id);
      setLookupId(job.id);
      setForm(job.input);
      setActiveLoveJobId(job.id);
      setIsDetailUnlocked(isPaidOnlyVariant || isJobUnlocked(job.id));

      if (job.status === "completed" && job.result) {
        setResult(job.result);
        setStep("result");
        setError("");
        return;
      }

      if (job.status === "pending") {
        setResult(null);
        setStep("pending");
        setError("");
        return;
      }

      setResult(null);
      setStep("input");
      setError("분석 처리 중 오류가 발생했어요. 다시 요청해 주세요.");
    },
    [isPaidOnlyVariant],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const bootstrap = async () => {
      await runLoveAutomation();

      const fromUrl = parseRidFromUrl();
      const fallback = fromUrl ?? getActiveLoveJobId();
      if (!fallback || cancelled) return;

      const job = await resolveLoveJob(fallback);
      if (!job || cancelled) return;

      timer = window.setTimeout(() => {
        applyJobState(job);
      }, 0);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [applyJobState]);

  useEffect(() => {
    syncRidToUrl(jobId);
  }, [jobId]);

  useEffect(() => {
    if (step !== "pending" || !jobId) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const job = await resolveLoveJob(jobId);
      if (cancelled) return;

      if (!job) {
        setError("요청 정보를 찾지 못했어요. 다시 분석해 주세요.");
        setStep("input");
        return;
      }

      if (job.status === "completed" && job.result) {
        setResult(job.result);
        setForm(job.input);
        setStep("result");
        return;
      }

      if (job.status === "failed") {
        setError("분석 처리 중 오류가 발생했어요. 다시 요청해 주세요.");
        setStep("input");
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 900);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, jobId]);

  const updateField = <K extends keyof SajuInput>(key: K, value: SajuInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!form.birthDate) {
      setError("생년월일은 꼭 입력해 주세요.");
      return;
    }

    setError("");
    const job = await createLoveJob(form);
    setJobId(job.id);
    setLookupId(job.id);
    setIsDetailUnlocked(isPaidOnlyVariant);
    setResult(null);
    setStep("pending");
  };

  const loadById = async () => {
    const normalized = lookupId.trim();
    if (!normalized) {
      setLookupError("요청 ID를 입력해 주세요.");
      return;
    }

    const job = await resolveLoveJob(normalized);
    if (!job) {
      setLookupError("해당 ID 결과를 찾지 못했어요.");
      return;
    }

    setLookupError("");
    applyJobState(job);
  };

  const copyJobId = async () => {
    if (!jobId || typeof window === "undefined" || !navigator?.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(jobId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const unlockDetail = () => {
    if (!jobId) return;
    markJobUnlocked(jobId);
    setIsDetailUnlocked(true);
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_6%_4%,var(--seed-color-bg-brand-weak),transparent_34%),radial-gradient(circle_at_96%_2%,var(--seed-color-bg-brand-weak),transparent_28%),var(--seed-color-bg-layer-fill)]">
      {step === "landing" && (
        <ScreenFrame>
          <section className={cardClassName}>
            <CarrotBuddy label="연애운 캐릭터" />
            <Text
              as="h1"
              className="mt-1 block text-[30px] font-black leading-[1.18] tracking-[-0.02em] text-seed-fg-primary"
            >
              490원 연애운 보기
            </Text>
            <Text as="p" className="mt-2.5 block text-[15px] leading-[1.5] text-seed-fg-muted">
              {isPaidOnlyVariant
                ? "결제 후 전체 리포트를 제공하는 실험군입니다."
                : "무료 요약을 먼저 제공하고, 상세 리포트는 결제 후 제공하는 실험군입니다."}
            </Text>
            <div className="mt-4 inline-flex rounded-full border border-seed-stroke-brand bg-seed-bg-brand-weak px-3 py-2 text-[13px] font-bold text-seed-fg-brand">
              {isPaidOnlyVariant ? "전면 유료 실험군" : "무료요약+상세결제 실험군"}
            </div>
            <p className="mt-1 text-[11px] text-seed-fg-subtle">
              실험 소스: {pricingSource} · variant: {pricingVariant}
            </p>
            <ActionButton
              variant="brandSolid"
              size="large"
              className="mt-4 w-full"
              onClick={() => setStep("input")}
            >
              사주 보기 시작하기
            </ActionButton>

            <div className="mt-5 rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill p-3">
              <p className="text-xs font-semibold text-seed-fg-primary">요청 ID로 결과 이어보기</p>
              <TextField.Root className="mt-2 bg-seed-bg-default">
                <TextField.Input
                  aria-label="요청 ID"
                  placeholder="예: 5pQzK8yN1aBc"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                />
              </TextField.Root>
              {lookupError ? <p className="mt-2 text-xs text-[var(--seed-color-fg-critical)]">{lookupError}</p> : null}
              <ActionButton variant="neutralWeak" size="medium" className="mt-2 w-full" onClick={loadById}>
                결과 조회
              </ActionButton>
            </div>
          </section>
        </ScreenFrame>
      )}

      {step === "input" && (
        <>
          <TopBar title="사주 정보 입력" onBack={() => setStep("landing")} />
          <ScreenFrame>
            <section className={cardClassName}>
              <Text as="p" className="mb-4 block text-sm leading-[1.45] text-seed-fg-muted">
                간단한 정보 입력 후 바로 연애/사랑운을 분석해요.
              </Text>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">
                이름 (선택)
              </label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="홍길동"
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

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">
                출생 시간 (선택)
              </label>
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
                    onChange={(e) =>
                      updateField("calendarType", e.target.value as SajuInput["calendarType"])
                    }
                  >
                    <option value="solar">양력</option>
                    <option value="lunar">음력</option>
                  </select>
                </div>
              </div>

              <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">
                출생지 (선택)
              </label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  value={form.birthPlace}
                  onChange={(e) => updateField("birthPlace", e.target.value)}
                  placeholder="서울"
                />
              </TextField.Root>

              {error ? <p className="mt-3 text-[13px] text-[var(--seed-color-fg-critical)]">{error}</p> : null}

              <ActionButton variant="brandSolid" size="large" className="mt-4 w-full" onClick={submit}>
                {isPaidOnlyVariant ? "490원 결제 후 분석하기" : "무료 요약 먼저 보기"}
              </ActionButton>
            </section>
          </ScreenFrame>
        </>
      )}

      {step === "pending" && (
        <>
          <TopBar title="분석 중" onBack={() => setStep("input")} />
          <ScreenFrame>
            <section className={`${cardClassName} text-center`}>
              <CarrotBuddy label="분석 진행 캐릭터" />
              <Text as="h2" className="mt-1 block text-[24px] font-black leading-[1.25] text-seed-fg-primary">
                연애운을 읽는 중이에요
              </Text>
              <Text as="p" className="mt-2 block text-sm leading-[1.45] text-seed-fg-muted">
                {isPaidOnlyVariant
                  ? "결제형 전체 리포트를 생성 중입니다. 앱을 닫아도 요청 ID로 이어볼 수 있어요."
                  : "무료 요약 리포트를 먼저 생성 중입니다. 앱을 닫아도 요청 ID로 이어볼 수 있어요."}
              </Text>
              {jobId ? (
                <p className="mt-2 text-xs text-seed-fg-subtle">
                  요청 ID: <b className="text-seed-fg-primary">{jobId}</b>
                </p>
              ) : null}
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-seed-bg-fill">
                <span className="block h-full w-[35%] animate-loading rounded-full bg-seed-bg-brand" />
              </div>
            </section>
          </ScreenFrame>
        </>
      )}

      {step === "result" && result && (
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
                  요청 ID: <b className="text-seed-fg-primary">{jobId}</b>
                </p>
                <ActionButton variant="neutralWeak" size="small" onClick={copyJobId}>
                  {copied ? "복사됨" : "ID 복사"}
                </ActionButton>
              </div>

              {showFullResult ? (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                      <span className="block text-xs text-seed-fg-subtle">연애 점수</span>
                      <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">
                        {result.loveScore}점
                      </strong>
                    </article>
                    <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                      <span className="block text-xs text-seed-fg-subtle">결혼 전환</span>
                      <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">
                        {result.marriageScore}점
                      </strong>
                    </article>
                    <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                      <span className="block text-xs text-seed-fg-subtle">리스크</span>
                      <strong className="mt-1.5 block text-[17px] font-bold text-seed-fg-primary">
                        {result.riskScore}점
                      </strong>
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
                </>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-2.5">
                    <article className="rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill px-2 py-3 text-center">
                      <span className="block text-xs text-seed-fg-subtle">무료 요약 연애 점수</span>
                      <strong className="mt-1.5 block text-[19px] font-bold text-seed-fg-primary">
                        {result.loveScore}점
                      </strong>
                    </article>
                  </div>
                  <div className="mt-4 grid gap-2 text-left text-sm leading-[1.45] text-seed-fg-muted">
                    <p>
                      <b className="text-seed-fg-primary">무료 요약:</b> {result.summary}
                    </p>
                    <p>
                      <b className="text-seed-fg-primary">타이밍 힌트:</b> {result.timingHint}
                    </p>
                  </div>
                  <div className="mt-3 rounded-2xl border border-seed-stroke-brand bg-seed-bg-brand-weak px-3 py-3 text-left">
                    <p className="text-xs font-semibold text-seed-fg-primary">
                      상세 리포트(결혼 전환/리스크/근거코드) 잠금 상태
                    </p>
                    <p className="mt-1 text-xs text-seed-fg-muted">
                      490원 결제 시 전체 결과를 확인할 수 있어요.
                    </p>
                    <ActionButton variant="brandSolid" size="medium" className="mt-2 w-full" onClick={unlockDetail}>
                      490원 결제로 상세 보기 (실험)
                    </ActionButton>
                  </div>
                </>
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
