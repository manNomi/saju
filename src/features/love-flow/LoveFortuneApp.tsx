"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionButton, Text, TextField } from "@seed-design/react";
import { createLoveJobRequest, logClientEvent } from "@/lib/love-api-client";
import { type LoveJobInput } from "@/lib/love-job-types";

declare global {
  interface Window {
    turnstile?: {
      render: (selector: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Step = "landing" | "input" | "submitted";

type SajuInput = LoveJobInput;

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
  "rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-6 shadow-card motion-safe:animate-card-rise";

const STEP_INDEX: Record<Step, number> = {
  landing: 1,
  input: 2,
  submitted: 3,
};

const STEP_LABELS = ["소개", "정보입력", "완료"] as const;

function FlowStepper({ step }: { step: Step }) {
  const current = STEP_INDEX[step];

  return (
    <ol className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {STEP_LABELS.map((label, idx) => {
        const num = idx + 1;
        const active = num <= current;

        return (
          <li
            key={label}
            className={`flex min-w-[108px] items-center justify-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold transition-colors ${
              active
                ? "border-[var(--seed-color-stroke-brand)]/45 bg-seed-bg-brand-weak text-[var(--seed-color-fg-brand)] shadow-sm"
                : "border-seed-stroke-subtle bg-seed-bg-floating text-seed-fg-subtle"
            }`}
          >
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                active ? "bg-[var(--seed-color-bg-brand-solid)] text-white" : "bg-seed-bg-default text-seed-fg-subtle"
              }`}
            >
              {num}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}

function ScreenFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main
      className={`mx-auto w-full max-w-[430px] px-4 pb-[calc(var(--seed-safe-area-bottom)+20px)] pt-6 motion-safe:animate-screen-enter ${className}`}
    >
      {children}
    </main>
  );
}

function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-seed-stroke-subtle/70 bg-[color:var(--seed-color-bg-layer-default)]/92 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center px-4 text-seed-fg-primary">
        <button
          type="button"
          onClick={onBack}
          className="h-10 w-10 rounded-full border border-seed-stroke-subtle bg-seed-bg-fill text-lg disabled:opacity-0"
          disabled={!onBack}
          aria-label="뒤로가기"
        >
          ←
        </button>
        <p className="flex-1 text-center text-[15px] font-semibold">{title}</p>
        <div className="h-10 w-10" />
      </div>
    </header>
  );
}

function legalLinkClass() {
  return "inline-flex items-center justify-center rounded-full border border-seed-stroke-subtle bg-seed-bg-fill px-4 py-2.5 text-[12px] text-seed-fg-subtle underline underline-offset-2 transition-transform duration-150 active:scale-[0.98]";
}

export default function LoveFortuneApp() {
  const [step, setStep] = useState<Step>("landing");
  const [form, setForm] = useState<SajuInput>(DEFAULT_INPUT);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const updateField = <K extends keyof SajuInput>(key: K, value: SajuInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (isSubmitting) return;

    if (!form.birthDate) {
      setError("생년월일은 꼭 입력해 주세요.");
      return;
    }

    if (!form.email) {
      setError("결과를 받을 이메일을 입력해 주세요.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const created = await createLoveJobRequest(form, captchaToken || undefined);
      await logClientEvent({ event: "job_submit", jobId: created.job.id });
      setStep("submitted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 생성에 실패했어요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetToLanding = () => {
    setForm(DEFAULT_INPUT);
    setCaptchaToken("");
    setError("");
    setStep("landing");
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_6%_4%,var(--seed-color-bg-brand-weak),transparent_34%),radial-gradient(circle_at_96%_2%,var(--seed-color-bg-brand-weak),transparent_28%),var(--seed-color-bg-layer-fill)]">
      {step === "landing" && (
        <>
          <header className="sticky top-0 z-20 border-b border-seed-stroke-subtle/70 bg-[color:var(--seed-color-bg-layer-default)]/92 backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
              <button
                type="button"
                className="h-10 w-10 rounded-full border border-seed-stroke-subtle bg-seed-bg-fill text-lg"
                aria-label="새로고침"
                onClick={() => window.location.reload()}
              >
                ↻
              </button>
              <p className="text-[15px] font-semibold text-seed-fg-primary">오늘의 연애운</p>
              <div className="h-10 w-10" />
            </div>
          </header>

          <ScreenFrame>
            <section className="relative overflow-hidden rounded-[30px] border border-seed-stroke-subtle bg-seed-bg-floating p-6 shadow-card motion-safe:animate-card-rise">
              <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-seed-bg-brand-weak/80" />
              <div className="pointer-events-none absolute -bottom-10 -left-7 h-24 w-24 rounded-full bg-seed-bg-brand-weak/70" />

              <p className="inline-flex rounded-full border border-[var(--seed-color-stroke-brand)]/40 bg-seed-bg-brand-weak px-3 py-1 text-[12px] font-semibold text-[var(--seed-color-fg-brand)]">
                무료 연애운 리포트
              </p>

              <div className="mt-4 flex items-end gap-3">
                <span className="text-[56px] font-black leading-none text-[var(--seed-color-fg-brand)]">82</span>
                <span className="pb-1 text-lg font-semibold text-seed-fg-subtle">점</span>
                <span className="ml-auto rounded-full bg-seed-bg-fill px-3 py-1 text-[12px] font-semibold text-seed-fg-primary">
                  올해부터 상승 흐름
                </span>
              </div>

              <Text as="h1" className="mt-3 block text-[28px] font-black leading-[1.2] tracking-[-0.03em] text-seed-fg-primary">
                기존엔 답답했어도
                <br />
                지금부터는 풀려요
              </Text>

              <Text as="p" className="mt-3 block text-[15px] leading-[1.55] text-seed-fg-muted">
                기존에는 연애운이 낮게 느껴질 수 있었지만,
                <br />
                올해부터는 관계 흐름이 점진적으로 살아나는 시기예요.
              </Text>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <span className="rounded-full bg-seed-bg-fill px-3 py-1.5 text-[12px] font-medium text-seed-fg-primary">#인연유입</span>
                <span className="rounded-full bg-seed-bg-fill px-3 py-1.5 text-[12px] font-medium text-seed-fg-primary">#관계회복</span>
                <span className="rounded-full bg-seed-bg-fill px-3 py-1.5 text-[12px] font-medium text-seed-fg-primary">#상승전환</span>
              </div>
            </section>

            <section className="mt-4 rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card">
              <h2 className="text-[14px] font-bold text-seed-fg-primary">이런 형태로 안내해드려요</h2>
              <ul className="mt-3 space-y-2 text-[13px] leading-[1.5] text-seed-fg-muted">
                <li className="rounded-xl bg-seed-bg-fill px-3 py-2">올해부터 풀리는 흐름을 중심으로 연애운 해석</li>
                <li className="rounded-xl bg-seed-bg-fill px-3 py-2">연도별 기회/리스크와 실천 포인트를 짧게 정리</li>
                <li className="rounded-xl bg-seed-bg-fill px-3 py-2">결과는 이메일로 받아서 언제든 다시 확인</li>
              </ul>
            </section>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
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

            <div className="mt-10 rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-4 shadow-card">
              <ActionButton
                variant="brandSolid"
                size="large"
                className="w-full !min-h-[56px] transition-transform duration-150 active:scale-[0.98] motion-safe:animate-soft-pulse"
                onClick={() => setStep("input")}
              >
                무료로 시작하기
              </ActionButton>
              <p className="mt-3 text-center text-[12px] text-seed-fg-subtle">입력은 1분 내로 끝나요</p>
            </div>
          </ScreenFrame>
        </>
      )}

      {step === "input" && (
        <>
          <TopBar title="사주 정보 입력" onBack={() => setStep("landing")} />
          <ScreenFrame>
            <FlowStepper step={step} />
            <section className="mb-4 rounded-3xl border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card">
              <p className="inline-flex rounded-full bg-seed-bg-fill px-3 py-1 text-[12px] font-semibold text-seed-fg-primary">
                입력 1분 + 이메일 발송
              </p>
              <Text as="h2" className="mt-2 block text-[22px] font-black leading-[1.25] text-seed-fg-primary">
                사주 정보만 입력하면
                <br />
                결과는 자동으로 도착해요
              </Text>
              <Text as="p" className="mt-2 block text-[14px] leading-[1.55] text-seed-fg-muted">
                입력 후 바로 분석 큐에 등록되고,
                <br />
                완료되면 이메일로 결과를 보내드립니다.
              </Text>
            </section>

            <section className={cardClassName}>
              <label className="mb-2 mt-1 block text-[13px] font-bold text-seed-fg-primary">이름 (선택)</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="홍길동"
                />
              </TextField.Root>

              <label className="mb-2 mt-4 block text-[13px] font-bold text-seed-fg-primary">이메일</label>
              <TextField.Root className="bg-seed-bg-default">
                <TextField.Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </TextField.Root>

              <div className="mt-4 rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill p-3">
                <p className="text-[12px] font-semibold text-seed-fg-primary">출생 정보</p>

                <label className="mb-2 mt-3 block text-[13px] font-bold text-seed-fg-primary">생년월일</label>
                <TextField.Root className="bg-seed-bg-default">
                  <TextField.Input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => updateField("birthDate", e.target.value)}
                  />
                </TextField.Root>

                <label className="mb-2 mt-4 block text-[13px] font-bold text-seed-fg-primary">출생 시간 (선택)</label>
                <TextField.Root className="bg-seed-bg-default">
                  <TextField.Input
                    type="time"
                    value={form.birthTime}
                    onChange={(e) => updateField("birthTime", e.target.value)}
                  />
                </TextField.Root>

                <div className="mt-4 grid grid-cols-2 gap-3">
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

                <label className="mb-2 mt-4 block text-[13px] font-bold text-seed-fg-primary">출생지 (선택)</label>
                <TextField.Root className="bg-seed-bg-default">
                  <TextField.Input
                    value={form.birthPlace}
                    onChange={(e) => updateField("birthPlace", e.target.value)}
                    placeholder="서울"
                  />
                </TextField.Root>
              </div>

              {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
                <div id="turnstile-widget" className="mt-5 min-h-[64px]" />
              ) : null}

              {error ? <p className="mt-4 text-[13px] text-[var(--seed-color-fg-critical)]">{error}</p> : null}

              <ActionButton
                variant="brandSolid"
                size="large"
                className="mt-9 w-full !min-h-[54px] transition-transform duration-150 active:scale-[0.98]"
                onClick={submit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    요청 등록 중 <LoadingDots />
                  </span>
                ) : (
                  "요청 등록하기"
                )}
              </ActionButton>

              <button
                type="button"
                className="mt-5 w-full rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill py-3 text-[14px] font-semibold text-seed-fg-primary transition-transform duration-150 active:scale-[0.98]"
                onClick={() => setForm(DEFAULT_INPUT)}
              >
                입력 초기화
              </button>
            </section>
          </ScreenFrame>
        </>
      )}

      {step === "submitted" && (
        <>
          <TopBar title="요청 완료" onBack={() => setStep("landing")} />
          <ScreenFrame>
            <FlowStepper step={step} />
            <section className={`${cardClassName} text-center`}>
              <p className="mx-auto inline-flex rounded-full border border-[var(--seed-color-stroke-brand)]/40 bg-seed-bg-brand-weak px-3 py-1 text-[12px] font-semibold text-[var(--seed-color-fg-brand)]">
                접수 완료
              </p>

              <Text as="h2" className="mt-3 block text-[24px] font-black leading-[1.25] text-seed-fg-primary">
                요청이 접수됐어요
              </Text>
              <Text as="p" className="mt-3 block text-sm leading-[1.5] text-seed-fg-muted">
                분석이 완료되면 입력하신 이메일로 결과를 보내드릴게요.
              </Text>

              <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-2xl bg-seed-bg-fill px-3 py-3">
                  <p className="text-[11px] text-seed-fg-subtle">처리 방식</p>
                  <p className="mt-1 text-[13px] font-semibold text-seed-fg-primary">비동기 자동 분석</p>
                </div>
                <div className="rounded-2xl bg-seed-bg-fill px-3 py-3">
                  <p className="text-[11px] text-seed-fg-subtle">발송 채널</p>
                  <p className="mt-1 text-[13px] font-semibold text-seed-fg-primary">이메일 리포트</p>
                </div>
              </div>

              <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--seed-color-stroke-brand)]/40 bg-seed-bg-brand-weak px-3 py-1.5 text-[12px] font-semibold text-[var(--seed-color-fg-brand)]">
                메일 발송 준비 중 <LoadingDots />
              </p>
              <p className="mt-3 text-xs text-seed-fg-subtle">메일 수신함과 스팸함을 함께 확인해 주세요.</p>

              <ActionButton variant="brandSolid" size="large" className="mt-10 w-full !min-h-[54px]" onClick={resetToLanding}>
                처음으로 돌아가기
              </ActionButton>

              <button
                type="button"
                className="mt-6 w-full rounded-2xl border border-seed-stroke-subtle bg-seed-bg-fill py-3 text-[14px] font-semibold text-seed-fg-primary transition-transform duration-150 active:scale-[0.98]"
                onClick={() => {
                  setForm(DEFAULT_INPUT);
                  setCaptchaToken("");
                  setError("");
                  setStep("input");
                }}
              >
                새 요청 다시 입력
              </button>
            </section>
          </ScreenFrame>
        </>
      )}
    </div>
  );
}
