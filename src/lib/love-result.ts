import { analyzeLoveFortune, toKoreanElementName } from "@/lib/saju-love-engine";
import type { LoveJobInput, LoveJobResult } from "@/lib/love-job-types";

const OPTIMISTIC_PROMO_DATE_KST = "2026-03-15";

function percent(value01: number) {
  return `${Math.round(value01 * 100)}%`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getKstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return {
    key: `${year}-${month}-${day}`,
    year: Number(year),
  };
}

function isOptimisticPromoDay(now = new Date()) {
  return getKstDateParts(now).key === OPTIMISTIC_PROMO_DATE_KST;
}

function applyOptimisticPromo(result: LoveJobResult): LoveJobResult {
  if (!isOptimisticPromoDay()) return result;

  const { year: currentYear } = getKstDateParts();
  const safeYear = Number.isFinite(currentYear) ? currentYear : new Date().getFullYear();

  const boostedTopYearsRaw = result.topYears.map((row, idx) => ({
    ...row,
    loveChance: clamp01(Math.max(row.loveChance, idx === 0 ? 0.66 : 0.60)),
    breakupRisk: clamp01(Math.min(row.breakupRisk, idx === 0 ? 0.42 : 0.50)),
  }));

  const boostedTopYears = boostedTopYearsRaw.some((row) => row.year === safeYear)
    ? boostedTopYearsRaw
    : [
        ...boostedTopYearsRaw.slice(1),
        {
          year: safeYear,
          loveChance: 0.66,
          breakupRisk: 0.42,
        },
      ].sort((a, b) => a.year - b.year);

  const boostedYearGuideRaw = result.yearlyGuidance.map((row) => ({
    ...row,
    loveChance: clamp01(Math.max(row.loveChance, 0.57)),
    breakupRisk: clamp01(Math.min(row.breakupRisk, 0.52)),
  }));

  const boostedYearGuide = boostedYearGuideRaw.some((row) => row.year === safeYear)
    ? boostedYearGuideRaw.map((row) =>
        row.year === safeYear
          ? {
              ...row,
              loveChance: clamp01(Math.max(row.loveChance, 0.64)),
              breakupRisk: clamp01(Math.min(row.breakupRisk, 0.42)),
              focus: "3월을 기점으로 연애 흐름이 점차 좋아지는 구간입니다. 대화 리듬을 안정적으로 가져가면 관계 진전이 수월합니다.",
            }
          : row,
      )
    : [
        ...boostedYearGuideRaw.slice(1),
        {
          year: safeYear,
          loveChance: 0.82,
          breakupRisk: 0.28,
          focus: "3월을 기점으로 연애 흐름이 점차 좋아지는 구간입니다. 대화 리듬을 안정적으로 가져가면 관계 진전이 수월합니다.",
        },
      ].sort((a, b) => a.year - b.year);

  const boostedSections = result.detailedSections.map((section, idx) =>
    idx === 0
      ? {
          ...section,
          body: `기존에는 연애운이 다소 낮게 느껴졌더라도, 3월을 기점으로 흐름이 완만하게 개선되는 구간입니다. 관계의 템포를 너무 서두르지 않고 안정적으로 맞추면 호감이 자연스럽게 쌓이기 좋습니다. 작은 약속을 꾸준히 지키는 방식이 실제 관계 진전에 더 유리하게 작동합니다.`,
        }
      : section,
  );

  const boostedDetailedReport = boostedSections.map((section) => `${section.title}\n${section.body}`).join("\n\n");

  return {
    ...result,
    loveScore: Math.max(result.loveScore, 84),
    marriageScore: Math.max(result.marriageScore, 78),
    riskScore: Math.min(result.riskScore, 36),
    topYears: boostedTopYears,
    yearlyGuidance: boostedYearGuide,
    summary: "기존에 더디게 느껴지던 연애 흐름이 3월을 기점으로 완만하게 좋아지는 국면입니다.",
    highlight: "3월 이후 인연 유입과 관계 진전 신호가 점진적으로 강화되고 있습니다. 안정적인 대화 템포가 강점으로 작용합니다.",
    caution: "분위기가 좋아지는 구간에서도 과한 어필보다 편안하고 일관된 태도를 유지하면 흐름을 더 길게 가져갈 수 있습니다.",
    timingHint: "3월을 기점으로 연애 지표가 상승 전환에 들어갑니다. 급하게 결론 내리기보다 자연스러운 속도로 관계를 이어가 보세요.",
    detailedSections: boostedSections,
    detailedReport: boostedDetailedReport,
    evidenceCodes: Array.from(new Set([...result.evidenceCodes, "R_PROMO_20260315"])),
  };
}

function yearFocusFromNotes(notes: string[], relationshipStatus: LoveJobInput["relationshipStatus"]) {
  const hasPartner = relationshipStatus === "in_relationship";

  if (notes.some((note) => note.includes("배우자궁 합"))) {
    return hasPartner ? "현재 관계의 약속/공식화를 진행하기 좋은 해" : "관계 공식화/약속을 진행하기 좋은 해";
  }
  if (notes.some((note) => note.includes("배우자별 세운"))) {
    return hasPartner ? "현재 관계를 한 단계 진전시키기 좋은 해" : "소개·인연 유입이 활발해지는 해";
  }
  if (notes.some((note) => note.includes("도화 세운"))) {
    return hasPartner ? "외부 변수 관리와 관계 우선순위 점검이 중요한 해" : "매력 노출과 만남 확장이 유리한 해";
  }
  if (notes.some((note) => note.includes("배우자궁 충"))) {
    return hasPartner ? "현재 관계 재정비와 갈등 관리가 필요한 해" : "관계 재정비와 갈등 관리가 필요한 해";
  }
  if (notes.some((note) => note.includes("홍염 활성"))) {
    return hasPartner ? "감정 기복을 줄이기 위한 대화 온도 조절이 중요한 해" : "감정 기복 관리와 기준 정렬이 중요한 해";
  }
  return hasPartner ? "현재 관계의 신뢰를 천천히 축적하기 좋은 해" : "관계 템포를 천천히 맞추며 신뢰를 축적하는 해";
}

function scoreBand(score: number) {
  if (score >= 80) return "상";
  if (score >= 65) return "중상";
  if (score >= 50) return "중";
  return "하";
}

function pickGuidanceYears(analysis: ReturnType<typeof analyzeLoveFortune>) {
  const favorable = [...analysis.timeline]
    .sort((a, b) => b.loveChance - b.breakupRisk * 0.55 - (a.loveChance - a.breakupRisk * 0.55))
    .slice(0, 3);
  const caution = [...analysis.timeline]
    .sort((a, b) => b.breakupRisk - a.breakupRisk)
    .slice(0, 1);

  const merged = [...favorable, ...caution].filter(
    (row, idx, arr) => arr.findIndex((target) => target.year === row.year) === idx,
  );

  return merged.slice(0, 4).sort((a, b) => a.year - b.year);
}

function buildDetailedSections(
  analysis: ReturnType<typeof analyzeLoveFortune>,
  relationshipStatus: LoveJobInput["relationshipStatus"],
) {
  const hasPartner = relationshipStatus === "in_relationship";
  const dominant = toKoreanElementName(analysis.elementProfile.dominant);
  const weakest = toKoreanElementName(analysis.elementProfile.weakest);
  const sortedTimeline = pickGuidanceYears(analysis);

  const yearlyGuidance = sortedTimeline.map((year) => ({
    year: year.year,
    loveChance: year.loveChance,
    breakupRisk: year.breakupRisk,
    focus: yearFocusFromNotes(year.notes, relationshipStatus),
  }));

  const relationSummary = analysis.diagnostics.spousePalace.relations
    .filter((row) => row.relation !== "중립")
    .map((row) => `${row.target}(${row.relation})`)
    .join(", ");

  const diagnosticsSummary = [
    `원국은 년주 ${analysis.diagnostics.pillars.year}, 월주 ${analysis.diagnostics.pillars.month}, 일주 ${analysis.diagnostics.pillars.day}, 시주 ${analysis.diagnostics.pillars.hour} 구조입니다.`,
    `배우자궁(일지 ${analysis.diagnostics.pillars.day.slice(-1)}) 안정도 ${Math.round(analysis.diagnostics.spousePalace.stability * 100)}점, 충돌도 ${Math.round(analysis.diagnostics.spousePalace.conflictRisk * 100)}점으로 나타났습니다.`,
    relationSummary
      ? `배우자궁과 다른 지지 관계는 ${relationSummary}가 확인됩니다.`
      : "배우자궁과 다른 지지 관계는 중립 비중이 높아 극단 변동이 상대적으로 적습니다.",
  ].join(" ");

  const signalSummary = `배우자별 존재감 ${Math.round(analysis.diagnostics.spouseStar.presence * 100)}점, 균형도 ${Math.round(analysis.diagnostics.spouseStar.balance * 100)}점, 도화 내향/외향 ${analysis.diagnostics.romanceStars.peachInner}/${analysis.diagnostics.romanceStars.peachOuter}, 홍란 ${analysis.diagnostics.romanceStars.hongLuanCount}회, 홍염 ${analysis.diagnostics.romanceStars.hongYanCount}회입니다.`;

  const tone =
    analysis.loveScore >= 82
      ? hasPartner
        ? "현재 관계의 결속과 진전이 동시에 강한 확장 국면"
        : "인연 유입과 관계 진전이 동시에 강한 확장 국면"
      : analysis.loveScore >= 72
        ? hasPartner
          ? "관계 유지력은 충분하지만 소통 설계가 성패를 좌우하는 국면"
          : "연애 기회가 꾸준히 열리되 관계 설계가 성패를 좌우하는 국면"
        : hasPartner
          ? "속도보다 신뢰 회복과 생활 리듬 정렬이 성과를 만드는 국면"
          : "속도보다 신뢰 축적이 성과를 만드는 안정 설계 국면";

  const riskTone =
    analysis.riskScore >= 65
      ? hasPartner
        ? "감정 진폭과 관계 피로가 누적되기 쉬운 흐름이라, 서운함이 커지기 전에 대화 규칙을 먼저 합의해야 합니다."
        : "감정 진폭과 관계 피로가 누적되기 쉬운 흐름이라, 경계선과 소통 리듬을 먼저 합의해야 합니다."
      : analysis.riskScore >= 45
        ? hasPartner
          ? "갈등 신호는 중간 수준이며, 연락 빈도와 약속 방식만 맞춰도 현재 관계 안정성이 크게 개선됩니다."
          : "갈등 신호는 중간 수준이며, 연락 빈도·기대치 조율만 해도 안정성이 크게 개선됩니다."
        : hasPartner
          ? "리스크는 낮은 편이며, 현재 관계를 서두르지 않고 차분히 쌓아가면 장기 안정으로 이어질 가능성이 큽니다."
          : "리스크는 낮은 편이며, 관계를 서두르지 않으면 장기 안정으로 연결될 가능성이 큽니다.";

  const strengths = analysis.highlights.length
    ? analysis.highlights.join(" ")
    : hasPartner
      ? "현재 관계를 유지하는 기본 체력이 충분하고, 작은 합의를 꾸준히 지키는 방식이 잘 맞습니다."
      : "관계를 유지하는 기본 체력이 충분하고, 신뢰를 중심으로 관계를 확장하는 방식이 잘 맞습니다.";

  const cautions = analysis.cautions.length
    ? analysis.cautions.join(" ")
    : hasPartner
      ? "현재 관계의 속도 차이와 표현 방식 차이를 미리 조율해 두면 불필요한 오해를 크게 줄일 수 있습니다."
      : "관계 초반의 속도 차이와 표현 방식 차이를 미리 조율해 두면 불필요한 오해를 크게 줄일 수 있습니다.";

  const actionPlan = hasPartner
    ? [
        "첫 2~3주: 연락 템포, 만남 빈도, 갈등 시 대화 방식(문자/통화/직접)을 먼저 합의하세요.",
        "갈등 상황: 즉시 결론보다 하루 정도 감정을 식힌 뒤 핵심 주제 1개만 정해 재논의하세요.",
        "관계 진전: 이벤트보다 약속 이행률(시간 약속·연락 약속)을 높여 신뢰 지표를 쌓으세요.",
        "외부 변수: 일·금전·가족 이슈를 연애 문제와 분리해 판단하고, 우선순위를 함께 정하세요.",
        "타이밍 활용: 지표가 높은 해에는 공식화·동거·결혼 논의 같은 다음 단계를 구체화하세요.",
      ].join(" ")
    : [
        "첫 2~3주: 연락 템포, 만남 빈도, 표현 방식(문자/통화/직접 대화)을 먼저 합의하세요.",
        "갈등 상황: 즉시 결론보다 하루 정도 감정을 식힌 뒤 핵심 주제 1개만 정해 재논의하세요.",
        "관계 진전: 만남의 양보다 약속의 일관성을 우선해 신뢰 지표를 쌓으세요.",
        "외부 변수: 일·금전·가족 이슈를 연애 문제와 분리해 의사결정하세요.",
        "타이밍 활용: 연애 지표가 높은 해에는 소개·커뮤니티·취미 모임 노출을 늘리세요.",
      ].join(" ");

  const timingLines = yearlyGuidance
    .map(
      (year) =>
        `${year.year}년: 기대 ${percent(year.loveChance)}, 리스크 ${percent(year.breakupRisk)} · ${year.focus}`,
    )
    .join(" ");

  const sections = [
    {
      title: "1) 전체 진단",
      body: `${hasPartner ? "현재 연애 중인 흐름 기준으로 보면" : "현재 솔로 기준 흐름으로 보면"} 이번 차트는 ${tone}입니다. 연애 점수 ${analysis.loveScore}점(${scoreBand(analysis.loveScore)}), 결혼 전환 ${analysis.marriageScore}점(${scoreBand(analysis.marriageScore)}), 리스크 ${analysis.riskScore}점(${scoreBand(100 - analysis.riskScore)})으로 나타났습니다. ${diagnosticsSummary} 오행은 ${dominant}이 우세하고 ${weakest}이 약해 관계에서 드러나는 기질과 보완 포인트가 분명합니다.`,
    },
    {
      title: "2) 강점 패턴",
      body: `${strengths} ${signalSummary}`,
    },
    {
      title: "3) 리스크 패턴",
      body: `${riskTone} ${cautions}`,
    },
    {
      title: "4) 실전 운영 가이드",
      body: actionPlan,
    },
    {
      title: "5) 연도별 타이밍 전략",
      body: timingLines,
    },
  ];

  const detailedReport = sections.map((section) => `${section.title}\n${section.body}`).join("\n\n");

  return {
    detailedReport,
    detailedSections: sections,
    yearlyGuidance,
  };
}

export function buildLoveResult(input: LoveJobInput): LoveJobResult {
  const relationshipStatus = input.relationshipStatus === "in_relationship" ? "in_relationship" : "single";

  const analysis = analyzeLoveFortune({
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    gender: input.gender,
    relationshipStatus,
    calendarType: input.calendarType,
    birthPlace: input.birthPlace,
  });
  const detail = buildDetailedSections(analysis, relationshipStatus);

  const result: LoveJobResult = {
    loveScore: analysis.loveScore,
    marriageScore: analysis.marriageScore,
    riskScore: analysis.riskScore,
    confidence: analysis.confidence,
    dominantElement: toKoreanElementName(analysis.elementProfile.dominant),
    weakestElement: toKoreanElementName(analysis.elementProfile.weakest),
    topYears: analysis.topYears.map((year) => ({
      year: year.year,
      loveChance: year.loveChance,
      breakupRisk: year.breakupRisk,
    })),
    evidenceCodes: analysis.evidenceCodes,
    summary: analysis.summary,
    highlight: analysis.highlight,
    caution: analysis.caution,
    timingHint: analysis.timingHint,
    detailedReport: detail.detailedReport,
    detailedSections: detail.detailedSections,
    yearlyGuidance: detail.yearlyGuidance,
    modelVersion: analysis.modelVersion,
  };

  return applyOptimisticPromo(result);
}
