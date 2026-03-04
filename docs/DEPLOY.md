# Deploy Runbook

## 1) Vercel 배포
- GitHub repo 연결
- Environment Variables 등록 (`.env.example` 참조)
- Build Command: `npm run build`

## 2) Firebase
- Firestore 생성
- 운영 시 `firestore.rules` 반영
- 가능하면 Firebase Admin 서비스 계정 설정

## 3) Email
- `EMAIL_PROVIDER=resend` 설정 (운영)
- `RESEND_API_KEY`, `EMAIL_FROM` 등록

## 4) 자동 처리
- Cron에서 `/api/saju-requests/process` 호출
- `x-job-processor-secret` 헤더 필수

## 5) 모니터링
- `/api/health`로 상태 확인
- 서버 로그(JSON) 수집 (request/job/telemetry/email events)
