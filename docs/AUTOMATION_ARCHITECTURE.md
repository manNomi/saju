# Saju Automation Architecture (MVP)

## 목표
사용자 입력을 Firestore에 저장한 뒤, Codex Automation이 비동기로 사주 분석을 수행하고 결과를 이메일로 발송한다.

요구 플로우:
1. 사용자가 입력
2. Firestore 등록
3. Codex Automation 트리거로 사주 분석
4. 입력된 이메일로 결과 발송

## 전체 구조

```mermaid
flowchart TD
  U[User Mobile Web] --> A[Next.js API: Create Request]
  A --> F[(Firestore: sajuRequests)]
  F --> C[Codex Automation Worker]
  C --> E[Saju Analysis Engine]
  E --> F
  C --> M[Email Provider (Resend/SES)]
  M --> U
```

## 컴포넌트

- Web Client (Next.js)
  - 입력 폼: 이름/생년월일/시각/성별/출생지/이메일
  - 접수 완료 시 `requestId` 표시
- API Server (Next.js Route Handler)
  - 요청 생성, 상태 조회
- Firestore
  - 작업 큐 + 결과 저장소
- Codex Automation
  - 주기 실행으로 `queued` 작업 검색
  - 사주 분석 후 결과 저장, 이메일 전송
- Email Provider
  - 결과 링크/요약 발송

## Firestore 스키마 (권장)

컬렉션: `sajuRequests`

```ts
{
  id: string,
  status: "queued" | "processing" | "completed" | "failed",
  input: {
    name: string,
    email: string,
    gender: "male" | "female",
    calendarType: "solar" | "lunar",
    birthDate: string,
    birthTime: string,
    birthPlace: string
  },
  result: null | {
    summary: string,
    detail: string,
    scores: {
      love: number,
      marriage: number,
      risk: number
    },
    topYears: Array<{ year: number; chance: number }>
  },
  email: {
    sent: boolean,
    sentAt: number | null,
    providerMessageId: string | null,
    error: string | null
  },
  lock: {
    workerId: string | null,
    lockedAt: number | null,
    lockExpireAt: number | null
  },
  createdAt: number,
  updatedAt: number,
  processedAt: number | null,
  error: string | null,
  retryCount: number
}
```

## API 설계 (MVP)

### 1) 요청 생성
- `POST /api/saju-requests`
- 입력 검증 후 Firestore에 `status=queued`로 저장
- 응답: `requestId`

### 2) 상태 조회
- `GET /api/saju-requests/:id`
- 응답: `status`, `result`(완료 시)

## Codex Automation 설계

실행 방식:
- 1분 간격 스케줄 실행 (또는 2~5분)
- 각 실행에서 `status=queued` 문서 최대 N개(예: 20개) 처리

처리 절차:
1. 문서 조회 (`queued`)
2. 락 획득 (transaction으로 `processing` 전환)
3. 사주 분석 실행
4. 결과 저장 (`completed`)
5. 이메일 발송
6. 이메일 성공 시 `email.sent=true`
7. 실패 시 `failed` + `error` + `retryCount + 1`

락/중복 처리:
- `lockExpireAt`을 두어 워커 장애 시 재처리 가능
- `processing`이 오래된 작업(예: 10분 초과)은 재큐잉

## 이메일 발송 설계

권장 Provider:
- Resend (구현 간단)
- AWS SES (대량 발송 시 비용 최적화)

발송 시점:
- `completed` 저장 직후

메일 내용:
- 제목: `[사주 결과] 요청하신 연애운 리포트가 도착했습니다`
- 본문: 핵심요약 + 결과 조회 링크
- 링크: `https://<domain>/?rid=<requestId>&token=<viewToken>`

## 보안/운영 포인트

- Firestore Rules: 클라이언트 직접 쓰기 금지, 서버 경유만 허용
- PII(이메일) 마스킹 로그 처리
- API rate limit + CAPTCHA(옵션)

## 실패 처리 정책

- 분석 실패: 최대 3회 재시도
- 이메일 실패: 분석 결과는 유지, 이메일만 재시도 큐로 분리 가능
- 장기 실패건: 운영자 대시보드/알림으로 수동 처리

## 단계별 구현 순서

1. 입력 폼에 `email` 필드 추가
2. `POST /api/saju-requests` 구현 + Firestore 저장
3. `GET /api/saju-requests/:id` 구현
4. Codex Automation 주기 작업 생성 (queued -> completed)
5. 이메일 Provider 연동
6. 실패/재시도 및 모니터링 추가

## 최소 환경 변수

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Email
RESEND_API_KEY=
EMAIL_FROM=

# App
APP_BASE_URL=
JOB_PROCESSOR_SECRET=
```
