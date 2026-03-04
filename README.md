# saju - 연애운 자동 분석 웹앱

모바일 웹뷰 기준 Next.js 앱입니다.

## 핵심 플로우

1. 사용자가 사주 + 이메일 입력
2. 서버 API가 Firestore(`sajuRequests`)에 `queued` 상태로 저장
3. Codex Automation(또는 크론)이 `/api/saju-requests/process` 호출
4. 분석 완료 후 이메일 발송 + 결과 조회 가능

## 보안 모델

- Firestore는 클라이언트 직접 접근 금지
- 모든 CRUD는 Next API 경유
- 결과 조회는 `requestId + accessToken` 필요
- `accessToken`은 서버에 해시 저장

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

# Email provider
EMAIL_PROVIDER=console
RESEND_API_KEY=
EMAIL_FROM=

# Abuse 방지
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# 배치 처리 endpoint 보호
JOB_PROCESSOR_SECRET=

# 로컬 대기화면에서 처리 보조 (개발용)
NEXT_PUBLIC_LOCAL_PROCESS_ASSIST=false
```

## 주요 API

- `POST /api/saju-requests`
- `GET /api/saju-requests/:id?token=...`
- `POST /api/saju-requests/process`

호환용 레거시 API도 유지됨:
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/process`

## Firestore Rules

운영에서는 `firestore.rules`를 적용하세요.

```bash
firebase deploy --only firestore:rules
```

현재 rules는 클라이언트 직접 접근을 차단하며, 서버 API + Admin SDK 사용을 전제로 합니다.

## 실행

```bash
npm install
npm run dev
```

## Codex Worker 실행

사주 결과 생성을 Codex CLI가 직접 담당하는 워커입니다.

```bash
# 1회 배치 처리 (queued 최대 3건)
npm run worker:once

# 상시 루프 처리 (45초 간격)
npm run worker:loop

# 타임아웃/복구 옵션 예시
node --env-file=.env.local scripts/codex-worker.mjs --once --max=3 --timeout=180 --stale=900
```

워커 필수 조건:

- `codex login` 완료
- `.env.local`에 Firebase Admin 키 설정
- 이메일 발송 시 `RESEND_API_KEY`, `EMAIL_FROM` 설정
- 필요 시 `CODEX_EXEC_TIMEOUT_SEC`, `CODEX_STALE_PROCESSING_SEC`로 기본값 조정 가능

### macOS launchd (1분 간격 자동 실행)

```bash
# 설치 (RunAtLoad + 60초 간격)
npm run worker:launchd:install

# 상태/로그 확인
npm run worker:launchd:status

# 제거
npm run worker:launchd:uninstall
```

로그 파일:

- `logs/codex-worker.log`
- `logs/codex-worker.err.log`

## 자동화/크론 예시

```bash
curl -X POST \
  -H "x-job-processor-secret: $JOB_PROCESSOR_SECRET" \
  https://<your-domain>/api/saju-requests/process
```

## 점검

```bash
npm run lint
npm run build
npm run app:smoke
```

## 아키텍처 문서

- [Automation Architecture](/Users/manwook-han/Desktop/code/saju/docs/AUTOMATION_ARCHITECTURE.md)
