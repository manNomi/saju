export type Gender = "male" | "female";
export type CalendarType = "solar" | "lunar";

export type BirthInput = {
  birthDate: string;
  birthTime?: string;
  gender: Gender;
  calendarType: CalendarType;
  birthPlace?: string;
};

export type YinYang = "yang" | "yin";
export type Element = "wood" | "fire" | "earth" | "metal" | "water";

export const STEMS = [
  "JIA",
  "YI",
  "BING",
  "DING",
  "WU",
  "JI",
  "GENG",
  "XIN",
  "REN",
  "GUI",
] as const;

export const BRANCHES = [
  "ZI",
  "CHOU",
  "YIN",
  "MAO",
  "CHEN",
  "SI",
  "WU",
  "WEI",
  "SHEN",
  "YOU",
  "XU",
  "HAI",
] as const;

export type HeavenlyStem = (typeof STEMS)[number];
export type EarthlyBranch = (typeof BRANCHES)[number];

export type Pillar = {
  stem: HeavenlyStem;
  branch: EarthlyBranch;
};

export type Chart = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
};

export type TenGod =
  | "비견"
  | "겁재"
  | "식신"
  | "상관"
  | "정재"
  | "편재"
  | "정관"
  | "편관"
  | "정인"
  | "편인";

type SpousePalaceScore = {
  stability: number;
  warmth: number;
  conflictRisk: number;
};

type SpouseStarScore = {
  presence: number;
  balance: number;
  conflictRisk: number;
};

type PeachBlossomScore = {
  count: number;
  inner: number;
  outer: number;
};

type RomanceStars = {
  peachBlossom: PeachBlossomScore;
  hongLuanCount: number;
  hongYanCount: number;
};

export type ElementProfile = {
  counts: Record<Element, number>;
  dominant: Element;
  weakest: Element;
  balanceScore: number;
};

export type YearLoveLuck = {
  year: number;
  loveChance: number;
  breakupRisk: number;
  notes: string[];
};

export type LoveAnalysis = {
  chart: Chart;
  loveScore: number;
  marriageScore: number;
  riskScore: number;
  confidence: number;
  summary: string;
  highlight: string;
  caution: string;
  highlights: string[];
  cautions: string[];
  timingHint: string;
  topYears: YearLoveLuck[];
  timeline: YearLoveLuck[];
  dayMasterStrength: number;
  elementProfile: ElementProfile;
  evidenceCodes: string[];
  traces: string[];
  modelVersion: string;
};

const MODEL_VERSION = "love-engine-v2.2";

const STEM_ELEMENT: Record<HeavenlyStem, Element> = {
  JIA: "wood",
  YI: "wood",
  BING: "fire",
  DING: "fire",
  WU: "earth",
  JI: "earth",
  GENG: "metal",
  XIN: "metal",
  REN: "water",
  GUI: "water",
};

const STEM_YY: Record<HeavenlyStem, YinYang> = {
  JIA: "yang",
  YI: "yin",
  BING: "yang",
  DING: "yin",
  WU: "yang",
  JI: "yin",
  GENG: "yang",
  XIN: "yin",
  REN: "yang",
  GUI: "yin",
};

const BRANCH_ELEMENT: Record<EarthlyBranch, Element> = {
  ZI: "water",
  CHOU: "earth",
  YIN: "wood",
  MAO: "wood",
  CHEN: "earth",
  SI: "fire",
  WU: "fire",
  WEI: "earth",
  SHEN: "metal",
  YOU: "metal",
  XU: "earth",
  HAI: "water",
};

const HIDDEN_STEMS: Record<EarthlyBranch, HeavenlyStem[]> = {
  ZI: ["GUI"],
  CHOU: ["JI", "GUI", "XIN"],
  YIN: ["JIA", "BING", "WU"],
  MAO: ["YI"],
  CHEN: ["WU", "YI", "GUI"],
  SI: ["BING", "WU", "GENG"],
  WU: ["DING", "JI"],
  WEI: ["JI", "YI", "DING"],
  SHEN: ["GENG", "REN", "WU"],
  YOU: ["XIN"],
  XU: ["WU", "XIN", "DING"],
  HAI: ["REN", "JIA"],
};

const HIDDEN_STEM_WEIGHTS = [0.62, 0.28, 0.1] as const;

const PEACH_BLOSSOM_MAP: Record<EarthlyBranch, EarthlyBranch> = {
  YIN: "MAO",
  WU: "MAO",
  XU: "MAO",
  SHEN: "YOU",
  ZI: "YOU",
  CHEN: "YOU",
  HAI: "ZI",
  MAO: "ZI",
  WEI: "ZI",
  SI: "WU",
  YOU: "WU",
  CHOU: "WU",
};

const HONG_LUAN_MAP: Record<EarthlyBranch, EarthlyBranch> = {
  ZI: "MAO",
  CHOU: "YIN",
  YIN: "CHOU",
  MAO: "ZI",
  CHEN: "HAI",
  SI: "XU",
  WU: "YOU",
  WEI: "SHEN",
  SHEN: "WEI",
  YOU: "WU",
  XU: "SI",
  HAI: "CHEN",
};

const HONG_YAN_MAP: Record<HeavenlyStem, EarthlyBranch> = {
  JIA: "WU",
  YI: "WU",
  BING: "YIN",
  DING: "WEI",
  WU: "CHEN",
  JI: "CHEN",
  GENG: "XU",
  XIN: "YOU",
  REN: "ZI",
  GUI: "SHEN",
};

const HARMONY_PAIRS = new Set([
  "ZI-CHOU",
  "YIN-HAI",
  "MAO-XU",
  "CHEN-YOU",
  "SI-SHEN",
  "WU-WEI",
]);

const CLASH_PAIRS = new Set([
  "ZI-WU",
  "CHOU-WEI",
  "YIN-SHEN",
  "MAO-YOU",
  "CHEN-XU",
  "SI-HAI",
]);

const HARM_PAIRS = new Set([
  "ZI-WEI",
  "CHOU-WU",
  "YIN-SI",
  "MAO-CHEN",
  "SHEN-HAI",
  "YOU-XU",
]);

const PUNISH_PAIRS = new Set([
  "ZI-MAO",
  "CHOU-XU",
  "XU-WEI",
  "WEI-CHOU",
  "YIN-SI",
  "SI-SHEN",
  "SHEN-YIN",
]);

const BREAK_PAIRS = new Set([
  "ZI-YOU",
  "CHOU-CHEN",
  "YIN-HAI",
  "MAO-WU",
  "SHEN-SI",
  "XU-WEI",
]);

const MONTH_BRANCHES: EarthlyBranch[] = [
  "YIN",
  "MAO",
  "CHEN",
  "SI",
  "WU",
  "WEI",
  "SHEN",
  "YOU",
  "XU",
  "HAI",
  "ZI",
  "CHOU",
];

const MONTH_START_STEM_INDEX: Record<HeavenlyStem, number> = {
  JIA: 2,
  JI: 2,
  YI: 4,
  GENG: 4,
  BING: 6,
  XIN: 6,
  DING: 8,
  REN: 8,
  WU: 0,
  GUI: 0,
};

const HOUR_START_STEM_INDEX: Record<HeavenlyStem, number> = {
  JIA: 0,
  JI: 0,
  YI: 2,
  GENG: 2,
  BING: 4,
  XIN: 4,
  DING: 6,
  REN: 6,
  WU: 8,
  GUI: 8,
};

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toPercent01(value: number) {
  return clamp01(value / 100);
}

function amplify01(value: number, center = 0.5, gain = 1.35) {
  return clamp01(center + (value - center) * gain);
}

function generates(from: Element, to: Element) {
  return (
    (from === "wood" && to === "fire") ||
    (from === "fire" && to === "earth") ||
    (from === "earth" && to === "metal") ||
    (from === "metal" && to === "water") ||
    (from === "water" && to === "wood")
  );
}

function controls(from: Element, to: Element) {
  return (
    (from === "wood" && to === "earth") ||
    (from === "earth" && to === "water") ||
    (from === "water" && to === "fire") ||
    (from === "fire" && to === "metal") ||
    (from === "metal" && to === "wood")
  );
}

function pairKey(a: EarthlyBranch, b: EarthlyBranch) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function getBranchRelation(a: EarthlyBranch, b: EarthlyBranch): "합" | "충" | "형" | "해" | "파" | "중립" {
  const key = pairKey(a, b);
  if (HARMONY_PAIRS.has(key)) return "합";
  if (CLASH_PAIRS.has(key)) return "충";
  if (PUNISH_PAIRS.has(key)) return "형";
  if (HARM_PAIRS.has(key)) return "해";
  if (BREAK_PAIRS.has(key)) return "파";
  return "중립";
}

function tenGod(dayStem: HeavenlyStem, targetStem: HeavenlyStem): TenGod {
  const dayElement = STEM_ELEMENT[dayStem];
  const targetElement = STEM_ELEMENT[targetStem];
  const sameYinYang = STEM_YY[dayStem] === STEM_YY[targetStem];

  if (dayElement === targetElement) {
    return sameYinYang ? "비견" : "겁재";
  }

  if (generates(dayElement, targetElement)) {
    return sameYinYang ? "식신" : "상관";
  }

  if (controls(dayElement, targetElement)) {
    return sameYinYang ? "편재" : "정재";
  }

  if (controls(targetElement, dayElement)) {
    return sameYinYang ? "편관" : "정관";
  }

  return sameYinYang ? "편인" : "정인";
}

function parseBirthDate(birthDate: string, birthTime?: string) {
  const safeTime = birthTime && birthTime.length >= 4 ? birthTime : "12:00";
  const parsed = new Date(`${birthDate}T${safeTime}:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date();
}

function getSolarMonthIndex(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const md = month * 100 + day;

  if (md >= 204 && md < 306) return 1;
  if (md >= 306 && md < 405) return 2;
  if (md >= 405 && md < 506) return 3;
  if (md >= 506 && md < 606) return 4;
  if (md >= 606 && md < 707) return 5;
  if (md >= 707 && md < 808) return 6;
  if (md >= 808 && md < 908) return 7;
  if (md >= 908 && md < 1008) return 8;
  if (md >= 1008 && md < 1107) return 9;
  if (md >= 1107 && md < 1207) return 10;
  if (md >= 1207 || md < 106) return 11;
  return 12;
}

function buildApproxChart(input: BirthInput): Chart {
  const localDate = parseBirthDate(input.birthDate, input.birthTime);

  let adjustedYear = localDate.getFullYear();
  const month = localDate.getMonth() + 1;
  const day = localDate.getDate();
  if (month < 2 || (month === 2 && day < 4)) {
    adjustedYear -= 1;
  }

  const yearStem = STEMS[mod(adjustedYear - 4, 10)];
  const yearBranch = BRANCHES[mod(adjustedYear - 4, 12)];

  const monthIndex = getSolarMonthIndex(localDate);
  const monthBranch = MONTH_BRANCHES[monthIndex - 1];
  const monthStem = STEMS[mod(MONTH_START_STEM_INDEX[yearStem] + monthIndex - 1, 10)];

  const utcBirthDate = Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate());
  const utcRefJiaZi = Date.UTC(1984, 1, 2);
  const diffDays = Math.floor((utcBirthDate - utcRefJiaZi) / 86_400_000);
  const dayCycleIndex = mod(diffDays, 60);
  const dayStem = STEMS[mod(dayCycleIndex, 10)];
  const dayBranch = BRANCHES[mod(dayCycleIndex, 12)];

  const hour = localDate.getHours();
  const hourBranchIndex = mod(Math.floor((hour + 1) / 2), 12);
  const hourBranch = BRANCHES[hourBranchIndex];
  const hourStem = STEMS[mod(HOUR_START_STEM_INDEX[dayStem] + hourBranchIndex, 10)];

  return {
    year: { stem: yearStem, branch: yearBranch },
    month: { stem: monthStem, branch: monthBranch },
    day: { stem: dayStem, branch: dayBranch },
    hour: { stem: hourStem, branch: hourBranch },
  };
}

function calcElementProfile(chart: Chart): ElementProfile {
  const counts: Record<Element, number> = {
    wood: 0,
    fire: 0,
    earth: 0,
    metal: 0,
    water: 0,
  };

  [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem].forEach((stem) => {
    counts[STEM_ELEMENT[stem]] += 1;
  });

  [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch].forEach((branch) => {
    counts[BRANCH_ELEMENT[branch]] += 0.85;
    HIDDEN_STEMS[branch].forEach((stem, idx) => {
      const weight = HIDDEN_STEM_WEIGHTS[idx] ?? 0.06;
      counts[STEM_ELEMENT[stem]] += weight;
    });
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]) as Array<[Element, number]>;
  const dominant = sorted[0][0];
  const weakest = sorted[sorted.length - 1][0];

  const avg = Object.values(counts).reduce((sum, v) => sum + v, 0) / 5;
  const variance = Object.values(counts).reduce((sum, v) => sum + (v - avg) ** 2, 0) / 5;
  const std = Math.sqrt(variance);
  const balanceScore = clamp01(1 - std / 1.25);

  return { counts, dominant, weakest, balanceScore };
}

function calcDayMasterStrength(chart: Chart, elementProfile: ElementProfile) {
  const dayElement = STEM_ELEMENT[chart.day.stem];
  const monthElement = BRANCH_ELEMENT[chart.month.branch];

  let strength = 0.5;

  if (dayElement === monthElement) strength += 0.16;
  if (generates(monthElement, dayElement)) strength += 0.2;
  if (generates(dayElement, monthElement)) strength -= 0.16;
  if (controls(monthElement, dayElement)) strength -= 0.2;

  const support =
    elementProfile.counts[dayElement] +
    Object.entries(elementProfile.counts)
      .filter(([elem]) => generates(elem as Element, dayElement))
      .reduce((sum, [, value]) => sum + value, 0);

  const drain =
    Object.entries(elementProfile.counts)
      .filter(([elem]) => generates(dayElement, elem as Element) || controls(dayElement, elem as Element))
      .reduce((sum, [, value]) => sum + value, 0) * 0.75;

  const net = (support - drain) / 10;
  strength += net;

  return clamp01(strength);
}

function scoreSpousePalace(chart: Chart, dayMasterStrength: number): SpousePalaceScore {
  const spouseBranch = chart.day.branch;
  const dayElement = STEM_ELEMENT[chart.day.stem];
  const spouseElement = BRANCH_ELEMENT[spouseBranch];

  let stability = 0.48;
  let warmth = 0.46;
  let conflictRisk = 0.35;

  if (generates(dayElement, spouseElement)) {
    stability += 0.18;
    warmth += 0.11;
  } else if (generates(spouseElement, dayElement)) {
    stability += 0.14;
    warmth += 0.08;
  } else if (controls(dayElement, spouseElement)) {
    conflictRisk += 0.16;
  } else if (controls(spouseElement, dayElement)) {
    stability += 0.04;
    conflictRisk += 0.12;
  }

  const hiddenTenGods = HIDDEN_STEMS[spouseBranch].map((stem) => tenGod(chart.day.stem, stem));
  const goodSet = new Set<TenGod>(["정관", "정재", "정인", "편인", "식신"]);
  const harshSet = new Set<TenGod>(["편관", "상관", "겁재", "비견"]);

  hiddenTenGods.forEach((tg) => {
    if (goodSet.has(tg)) stability += 0.05;
    if (harshSet.has(tg)) conflictRisk += 0.06;
  });

  const otherBranches: EarthlyBranch[] = [chart.year.branch, chart.month.branch, chart.hour.branch];
  otherBranches.forEach((branch) => {
    const relation = getBranchRelation(spouseBranch, branch);
    if (relation === "합") stability += 0.06;
    if (relation === "충") conflictRisk += 0.16;
    if (relation === "형") conflictRisk += 0.1;
    if (relation === "해") conflictRisk += 0.08;
    if (relation === "파") conflictRisk += 0.09;
  });

  if (dayMasterStrength < 0.35 || dayMasterStrength > 0.78) {
    conflictRisk += 0.08;
  }

  return {
    stability: clamp01(stability),
    warmth: clamp01(warmth),
    conflictRisk: clamp01(conflictRisk),
  };
}

function scoreSpouseStar(chart: Chart, gender: Gender, dayMasterStrength: number): SpouseStarScore {
  const target =
    gender === "male" ? new Set<TenGod>(["정재", "편재"]) : new Set<TenGod>(["정관", "편관"]);

  let rawCount = 0;

  [chart.year.stem, chart.month.stem, chart.day.stem, chart.hour.stem].forEach((stem) => {
    if (target.has(tenGod(chart.day.stem, stem))) rawCount += 1;
  });

  [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch].forEach((branch) => {
    HIDDEN_STEMS[branch].forEach((stem, idx) => {
      if (target.has(tenGod(chart.day.stem, stem))) {
        rawCount += idx === 0 ? 0.45 : 0.22;
      }
    });
  });

  let presence = clamp01(rawCount / 4.2);
  let balance = clamp01(1 - Math.abs(rawCount - 2) / 2.15);

  let conflictRisk = 0.24;
  if (rawCount < 0.7) conflictRisk += 0.2;
  if (rawCount > 3.4) conflictRisk += 0.19;

  if (dayMasterStrength < 0.3) {
    balance -= 0.08;
    conflictRisk += 0.07;
  }

  if (dayMasterStrength > 0.82) {
    presence -= 0.04;
    conflictRisk += 0.08;
  }

  return {
    presence: clamp01(presence),
    balance: clamp01(balance),
    conflictRisk: clamp01(conflictRisk),
  };
}

function calcRomanceStars(chart: Chart): RomanceStars {
  const positions: Array<{ pos: "year" | "month" | "day" | "hour"; branch: EarthlyBranch }> = [];
  const refs = [chart.year.branch, chart.day.branch];

  refs.forEach((ref) => {
    const target = PEACH_BLOSSOM_MAP[ref];
    if (chart.year.branch === target) positions.push({ pos: "year", branch: target });
    if (chart.month.branch === target) positions.push({ pos: "month", branch: target });
    if (chart.day.branch === target) positions.push({ pos: "day", branch: target });
    if (chart.hour.branch === target) positions.push({ pos: "hour", branch: target });
  });

  const deduped = new Set(positions.map((v) => `${v.pos}-${v.branch}`));
  const normalized = [...deduped].map((item) => {
    const [pos, branch] = item.split("-") as ["year" | "month" | "day" | "hour", EarthlyBranch];
    return { pos, branch };
  });

  const inner = normalized.filter((v) => v.pos === "year" || v.pos === "month").length;
  const outer = normalized.filter((v) => v.pos === "day" || v.pos === "hour").length;

  const hongLuanBranch = HONG_LUAN_MAP[chart.year.branch];
  const hongLuanCount = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch].filter(
    (b) => b === hongLuanBranch,
  ).length;

  const hongYanBranch = HONG_YAN_MAP[chart.day.stem];
  const hongYanCount = [chart.year.branch, chart.month.branch, chart.day.branch, chart.hour.branch].filter(
    (b) => b === hongYanBranch,
  ).length;

  return {
    peachBlossom: {
      count: normalized.length,
      inner,
      outer,
    },
    hongLuanCount,
    hongYanCount,
  };
}

function yearPillarByGregorianYear(year: number): Pillar {
  return {
    stem: STEMS[mod(year - 4, 10)],
    branch: BRANCHES[mod(year - 4, 12)],
  };
}

function calcYearLoveLuck(
  chart: Chart,
  gender: Gender,
  baseChance: number,
  baseRisk: number,
  dayMasterStrength: number,
): YearLoveLuck[] {
  const nowYear = new Date().getFullYear();
  const spouseTargets =
    gender === "male" ? new Set<TenGod>(["정재", "편재"]) : new Set<TenGod>(["정관", "편관"]);

  const timeline: YearLoveLuck[] = [];

  for (let year = nowYear; year <= nowYear + 9; year += 1) {
    const pillar = yearPillarByGregorianYear(year);
    const notes: string[] = [];
    let chance = baseChance;
    let risk = baseRisk;

    const yTg = tenGod(chart.day.stem, pillar.stem);
    if (spouseTargets.has(yTg)) {
      chance += 0.26;
      notes.push("배우자별 세운");
    }

    if (yTg === "비견" || yTg === "겁재") {
      risk += 0.08;
      notes.push("경쟁자/관계 분산 신호");
    }

    if (yTg === "상관") {
      risk += 0.07;
      notes.push("표현 과잉/감정 충돌 주의");
    }

    const rel = getBranchRelation(chart.day.branch, pillar.branch);
    if (rel === "합") {
      chance += 0.18;
      notes.push("배우자궁 합");
    }
    if (rel === "충") {
      risk += 0.26;
      notes.push("배우자궁 충");
    }
    if (rel === "형") {
      risk += 0.14;
      notes.push("배우자궁 형");
    }
    if (rel === "해" || rel === "파") {
      risk += 0.1;
      notes.push(rel === "해" ? "배우자궁 해" : "배우자궁 파");
    }

    const pbTarget = PEACH_BLOSSOM_MAP[chart.day.branch];
    if (pillar.branch === pbTarget) {
      chance += 0.12;
      notes.push("도화 세운");
    }

    if (pillar.branch === HONG_LUAN_MAP[chart.year.branch]) {
      chance += 0.15;
      notes.push("홍란 활성");
    }

    if (pillar.branch === HONG_YAN_MAP[chart.day.stem]) {
      risk += 0.12;
      notes.push("홍염 활성");
    }

    const yearElement = STEM_ELEMENT[pillar.stem];
    const dayElement = STEM_ELEMENT[chart.day.stem];
    if (generates(yearElement, dayElement) && dayMasterStrength < 0.5) {
      chance += 0.07;
      notes.push("일간 보강");
    }
    if (controls(yearElement, dayElement) && dayMasterStrength < 0.42) {
      risk += 0.09;
      notes.push("일간 압박");
    }

    timeline.push({
      year,
      loveChance: clamp01(chance),
      breakupRisk: clamp01(risk),
      notes,
    });
  }

  return timeline;
}

function buildConfidence(input: BirthInput) {
  let confidence = 0.82;

  if (!input.birthTime) confidence -= 0.1;
  if (input.calendarType === "lunar") confidence -= 0.05;
  if (!input.birthPlace) confidence -= 0.04;

  return clamp01(confidence);
}

function pickTopYears(timeline: YearLoveLuck[]) {
  return [...timeline]
    .sort((a, b) => b.loveChance - b.breakupRisk * 0.45 - (a.loveChance - a.breakupRisk * 0.45))
    .slice(0, 3)
    .sort((a, b) => a.year - b.year);
}

export function analyzeLoveFortune(input: BirthInput): LoveAnalysis {
  const chart = buildApproxChart(input);
  const elementProfile = calcElementProfile(chart);
  const dayMasterStrength = calcDayMasterStrength(chart, elementProfile);

  const spousePalace = scoreSpousePalace(chart, dayMasterStrength);
  const spouseStar = scoreSpouseStar(chart, input.gender, dayMasterStrength);
  const stars = calcRomanceStars(chart);

  const pbInnerNorm = Math.min(stars.peachBlossom.inner, 2) / 2;
  const pbOuterNorm = Math.min(stars.peachBlossom.outer, 2) / 2;
  const hongLuanNorm = Math.min(stars.hongLuanCount, 2) / 2;
  const hongYanNorm = Math.min(stars.hongYanCount, 2) / 2;

  const overallPotential = clamp01(
    0.32 * spouseStar.presence +
      0.15 * spouseStar.balance +
      0.14 * spousePalace.stability +
      0.08 * spousePalace.warmth +
      0.11 * pbInnerNorm +
      0.1 * hongLuanNorm +
      0.1 * elementProfile.balanceScore,
  );

  const instabilityRisk = clamp01(
    0.31 * spousePalace.conflictRisk +
      0.22 * spouseStar.conflictRisk +
      0.2 * pbOuterNorm +
      0.2 * hongYanNorm +
      0.07 * (1 - elementProfile.balanceScore),
  );

  const marriagePotential = clamp01(
    0.5 * spousePalace.stability + 0.4 * spouseStar.balance + 0.1 * dayMasterStrength,
  );

  const lovePotentialSpread = amplify01(
    overallPotential + 0.08 * (spousePalace.stability - spousePalace.conflictRisk) + 0.05 * (spouseStar.presence - 0.3),
    0.33,
    1.45,
  );

  const marriagePotentialSpread = amplify01(
    marriagePotential + 0.06 * spouseStar.presence - 0.04 * spousePalace.conflictRisk,
    0.43,
    1.4,
  );

  const riskPotentialSpread = amplify01(
    instabilityRisk + 0.06 * (1 - spousePalace.stability) + 0.04 * (stars.hongYanCount > 0 ? 1 : 0),
    0.4,
    1.45,
  );

  const loveScore = Math.round(38 + lovePotentialSpread * 60);
  const marriageScore = Math.round(35 + marriagePotentialSpread * 62);
  const riskScore = Math.round(8 + riskPotentialSpread * 92);

  const confidence = buildConfidence(input);
  const timeline = calcYearLoveLuck(
    chart,
    input.gender,
    lovePotentialSpread,
    riskPotentialSpread,
    dayMasterStrength,
  );
  const topYears = pickTopYears(timeline);
  const bestYear = topYears[0]?.year ?? new Date().getFullYear();

  let summary = "연애운이 안정적으로 흐릅니다. 속도보다 관계 구조를 단단히 잡는 방식이 유리해요.";
  if (loveScore >= 85 && riskScore < 40) {
    summary = "인연 유입과 관계 진전 흐름이 강합니다. 결혼 전환까지 노려볼 수 있는 국면입니다.";
  } else if (loveScore >= 73 && riskScore >= 62) {
    summary = "만남은 강하지만 감정 진폭도 큽니다. 기준/경계를 먼저 맞추면 성과가 큽니다.";
  } else if (loveScore < 58) {
    summary = "단기 스파크보다 신뢰 누적형 연애가 더 잘 맞습니다. 관계의 속도 조절이 핵심입니다.";
  }

  const highlights: string[] = [];
  const cautions: string[] = [];
  const evidenceCodes: string[] = [];

  if (spousePalace.stability > 0.72) {
    highlights.push("배우자궁 안정 신호가 강해 장기 관계 유지력에 강점이 있습니다.");
    evidenceCodes.push("R_SP_STABLE_HIGH");
  }
  if (spouseStar.presence > 0.66) {
    highlights.push("배우자별 활성도가 높아 인연 성사 확률이 높습니다.");
    evidenceCodes.push("R_SSTAR_PRESENT");
  }
  if (stars.hongLuanCount > 0) {
    highlights.push("홍란 신호가 있어 진지한 관계 이벤트(공식화/약속) 가능성이 있습니다.");
    evidenceCodes.push("R_HONGLUAN_ACTIVE");
  }
  if (elementProfile.balanceScore > 0.66) {
    highlights.push("오행 밸런스가 고르게 분포해 관계 안정성에 유리합니다.");
    evidenceCodes.push("R_ELEM_BALANCED");
  }

  if (stars.peachBlossom.outer > 0) {
    cautions.push("외도화 신호가 있어 관계 초반의 경계선/기대치 합의가 중요합니다.");
    evidenceCodes.push("R_PEACH_OUTER");
  }
  if (stars.hongYanCount > 0) {
    cautions.push("홍염 신호가 있어 감정 기복이 커질 수 있으니 템포 조절이 필요합니다.");
    evidenceCodes.push("R_HONGYAN_ACTIVE");
  }
  if (spousePalace.conflictRisk > 0.65) {
    cautions.push("배우자궁 충돌 신호가 있어 갈등 시 즉시 결론보다 냉각 시간이 유리합니다.");
    evidenceCodes.push("R_SP_CONFLICT_HIGH");
  }
  if (spouseStar.conflictRisk > 0.56) {
    cautions.push("배우자별 혼잡도가 있어 삼각 구도/연락 템포 이슈를 주의하세요.");
    evidenceCodes.push("R_SSTAR_CONGESTED");
  }

  if (highlights.length === 0) {
    highlights.push("관계 진행 속도를 조금만 늦추면 안정적인 성과를 만들 수 있습니다.");
    evidenceCodes.push("R_GENERAL_STABLE");
  }

  if (cautions.length === 0) {
    cautions.push("감정이 큰 날에는 일정·연락 규칙을 분명히 하는 것이 리스크를 줄입니다.");
    evidenceCodes.push("R_GENERAL_BOUNDARY");
  }

  const timingHint = `${bestYear}년에 연애/관계 전환 지표가 상대적으로 가장 좋게 나타납니다.`;

  const traces = [
    `dayMaster=${dayMasterStrength.toFixed(2)}, elementBalance=${elementProfile.balanceScore.toFixed(2)}`,
    `spousePalace(stability=${spousePalace.stability.toFixed(2)}, risk=${spousePalace.conflictRisk.toFixed(2)})`,
    `spouseStar(presence=${spouseStar.presence.toFixed(2)}, balance=${spouseStar.balance.toFixed(2)})`,
    `stars(pbInner=${stars.peachBlossom.inner}, pbOuter=${stars.peachBlossom.outer}, hongLuan=${stars.hongLuanCount}, hongYan=${stars.hongYanCount})`,
    `potential(raw=${overallPotential.toFixed(2)}, spread=${lovePotentialSpread.toFixed(2)}), risk(raw=${instabilityRisk.toFixed(2)}, spread=${riskPotentialSpread.toFixed(2)})`,
    `confidence=${confidence.toFixed(2)}, model=${MODEL_VERSION}`,
  ];

  return {
    chart,
    loveScore,
    marriageScore,
    riskScore,
    confidence,
    summary,
    highlight: highlights[0],
    caution: cautions[0],
    highlights,
    cautions,
    timingHint,
    topYears,
    timeline,
    dayMasterStrength,
    elementProfile,
    evidenceCodes,
    traces,
    modelVersion: MODEL_VERSION,
  };
}

export function toKoreanElementName(element: Element) {
  switch (element) {
    case "wood":
      return "목";
    case "fire":
      return "화";
    case "earth":
      return "토";
    case "metal":
      return "금";
    case "water":
      return "수";
    default:
      return "-";
  }
}

export function toPercentLabel(value01: number) {
  return `${Math.round(clamp01(value01) * 100)}%`;
}

export function normalizeScore01(score: number) {
  return toPercent01(score);
}
