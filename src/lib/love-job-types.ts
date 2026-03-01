export type LoveJobInput = {
  name: string;
  gender: "male" | "female";
  calendarType: "solar" | "lunar";
  birthDate: string;
  birthTime: string;
  birthPlace: string;
};

export type LoveJobResult = {
  loveScore: number;
  marriageScore: number;
  riskScore: number;
  confidence: number;
  dominantElement: string;
  weakestElement: string;
  topYears: Array<{ year: number; loveChance: number; breakupRisk: number }>;
  evidenceCodes: string[];
  summary: string;
  highlight: string;
  caution: string;
  timingHint: string;
  modelVersion: string;
};

export type LoveJobStatus = "awaiting_payment" | "pending" | "processing" | "completed" | "failed";
export type PaymentStatus = "unpaid" | "paid" | "failed";

export type LovePaymentInfo = {
  provider: "toss" | "mock";
  orderId: string;
  amount: number;
  currency: "KRW";
  paymentKey: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
};

export type LovePaymentPublic = Omit<LovePaymentInfo, "paymentKey">;

export type LoveJob = {
  id: string;
  status: LoveJobStatus;
  paymentStatus: PaymentStatus;
  input: LoveJobInput;
  result: LoveJobResult | null;
  error: string | null;
  payment: LovePaymentInfo;
  accessTokenHash: string;
  createdAt: number;
  updatedAt: number;
  processingStartedAt: number | null;
  processingCompletedAt: number | null;
  requestMeta: {
    ip: string;
    ua: string;
  };
};

export type LoveJobPublic = Omit<LoveJob, "accessTokenHash" | "requestMeta" | "payment"> & {
  payment: LovePaymentPublic;
};

export const LOVE_PRICE_KRW = 490;
export const LOVE_JOBS_COLLECTION = "loveJobs";
