export default function DisclaimerPage() {
  return (
    <main className="mx-auto w-full max-w-[430px] px-4 py-6 text-sm leading-6 text-seed-fg-primary">
      <h1 className="text-xl font-bold">이용 안내</h1>
      <p className="mt-3 text-seed-fg-muted">
        본 서비스의 사주 리포트는 전통 명리 규칙과 통계적 해석을 기반으로 한 참고용 콘텐츠입니다.
      </p>
      <ul className="mt-3 list-disc pl-5 text-seed-fg-muted">
        <li>의학/법률/투자/세무 자문을 대체하지 않습니다.</li>
        <li>결과는 사용자 의사결정의 보조 정보로만 활용해 주세요.</li>
        <li>서비스 운영 정책은 사전 공지 후 변경될 수 있습니다.</li>
      </ul>
    </main>
  );
}
