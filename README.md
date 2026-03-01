# saju - 490원 연애운 웹앱

모바일 웹뷰 기준으로 동작하는 Next.js 앱입니다.

## 핵심 플로우

1. 사용자가 사주 입력
2. 결제 진행 (토스 또는 mock)
3. 결제 확인 후 서버에서 분석 실행
4. 결과를 `요청 ID + 조회 키(token)`로 재조회

## 보안 모델

- 클라이언트는 Firestore를 직접 읽지 않습니다.
- 모든 접근은 Next API를 경유합니다.
- 결과 조회는 `jobId + accessToken`이 모두 필요합니다.
- `accessToken`은 서버에 해시로 저장됩니다.

## 환경 변수

`.env.local` 생성 후 아래 값 설정:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=saju-65bf8.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=saju-65bf8
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=saju-65bf8.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=158256646033
NEXT_PUBLIC_FIREBASE_APP_ID=

# 권장: Firebase Admin (운영)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Admin 미설정 시 fallback (개발에서만 권장)
FIREBASE_SERVER_FALLBACK_PUBLIC=true

# Toss 결제
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
ALLOW_MOCK_PAYMENTS=true

# Abuse 방지
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# 배치 처리 endpoint 보호
JOB_PROCESSOR_SECRET=
```

## Firestore Rules

운영에서는 `firestore.rules`를 적용하세요.

```bash
firebase deploy --only firestore:rules
```

현재 rules는 클라이언트 직접 접근을 차단합니다. 서버 API + Admin SDK 사용을 전제로 합니다.

주의: `NODE_ENV=production`에서는 `FIREBASE_SERVER_FALLBACK_PUBLIC=true`를 명시하지 않으면
public SDK fallback이 비활성화됩니다. 운영에서는 Admin 자격증명 사용을 권장합니다.

## 실행

```bash
npm install
npm run dev
```

## 분석 배치 처리 (자동화/크론)

분석 대기 작업을 주기적으로 처리하려면:

- Endpoint: `POST /api/jobs/process`
- Header: `x-job-processor-secret: <JOB_PROCESSOR_SECRET>`

예시(cron 1분):

```bash
curl -X POST \
  -H "x-job-processor-secret: $JOB_PROCESSOR_SECRET" \
  https://<your-domain>/api/jobs/process
```

## 점검

```bash
npm run lint
npm run build
```
