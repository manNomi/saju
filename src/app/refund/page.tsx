export default function RefundPage() {
  return (
    <main className="mx-auto w-full max-w-[430px] px-4 py-6 text-sm leading-6 text-seed-fg-primary">
      <h1 className="text-xl font-bold">환불 정책</h1>
      <p className="mt-3 text-seed-fg-muted">결제 승인 후 분석이 정상 생성되면 환불 대상에서 제외됩니다.</p>
      <ul className="mt-3 list-disc pl-5 text-seed-fg-muted">
        <li>결제되었으나 결과가 생성되지 않은 경우 환불 요청 가능</li>
        <li>중복 결제 또는 시스템 오류 결제는 확인 후 환불</li>
        <li>환불 문의: 운영자 문의 채널(추후 기입)</li>
      </ul>
    </main>
  );
}
