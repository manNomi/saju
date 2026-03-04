"use client";

import Image from "next/image";
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

function legalLinkClass() {
  return "inline-flex items-center rounded-md px-2 py-1 text-[11px] text-seed-fg-subtle underline underline-offset-2";
}

export default function LoveFortuneApp() {
  const [step, setStep] = useState<Step>("landing");
  const [form, setForm] = useState<SajuInput>(DEFAULT_INPUT);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

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
      setStep("submitted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 생성에 실패했어요.");
    }
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_6%_4%,var(--seed-color-bg-brand-weak),transparent_34%),radial-gradient(circle_at_96%_2%,var(--seed-color-bg-brand-weak),transparent_28%),var(--seed-color-bg-layer-fill)]">
      {step === "landing" && (
        <ScreenFrame>
          <section className="relative overflow-hidden rounded-[32px] border border-seed-stroke-subtle bg-seed-bg-floating p-5 shadow-card">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-seed-bg-brand-weak/80" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-seed-bg-brand-weak/70" />

            <p className="inline-flex rounded-full border border-[var(--seed-color-stroke-brand)]/40 bg-seed-bg-brand-weak px-3 py-1 text-[12px] font-semibold text-[var(--seed-color-fg-brand)]">
              무료 연애운 리포트
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
              무료입니다 지금.
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
              무료로 시작하기
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

      {step === "submitted" && (
        <>
          <TopBar title="요청 완료" onBack={() => setStep("landing")} />
          <ScreenFrame>
            <section className={`${cardClassName} text-center`}>
              <CarrotBuddy label="이메일 안내 캐릭터" />
              <Text as="h2" className="mt-1 block text-[24px] font-black leading-[1.25] text-seed-fg-primary">
                요청이 접수됐어요
              </Text>
              <Text as="p" className="mt-2 block text-sm leading-[1.45] text-seed-fg-muted">
                분석이 완료되면 입력하신 이메일로 결과를 보내드릴게요.
              </Text>
              <p className="mt-2 text-xs text-seed-fg-subtle">
                메일 수신함과 스팸함을 함께 확인해 주세요.
              </p>

              <ActionButton
                variant="brandSolid"
                size="large"
                className="mt-4 w-full"
                onClick={() => {
                  setForm(DEFAULT_INPUT);
                  setCaptchaToken("");
                  setError("");
                  setStep("landing");
                }}
              >
                처음으로 돌아가기
              </ActionButton>
            </section>
          </ScreenFrame>
        </>
      )}
    </div>
  );
}
