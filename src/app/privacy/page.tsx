export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[430px] px-4 py-6 text-sm leading-6 text-seed-fg-primary">
      <h1 className="text-xl font-bold">개인정보 처리방침</h1>
      <p className="mt-3 text-seed-fg-muted">
        본 서비스는 연애운 분석 결과 제공을 위해 이름(선택), 생년월일, 출생시각(선택), 출생지(선택) 정보를 수집합니다.
      </p>
      <ul className="mt-3 list-disc pl-5 text-seed-fg-muted">
        <li>수집 항목: 입력한 사주 정보, 결제 주문 정보, 요청 ID</li>
        <li>보관 목적: 결제 검증, 결과 재조회, 서비스 품질 개선</li>
        <li>보관 기간: 운영자가 설정한 기간 또는 사용자 삭제 요청 시</li>
      </ul>
    </main>
  );
}
