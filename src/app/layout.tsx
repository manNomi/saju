import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "490원 연애운 보기",
  description: "논문·사주 자료를 기반으로 서버비만 받고 제공하는 연애운 리포트",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-seed-color-mode="system">
      <body
        className={`${notoSansKR.variable} min-h-dvh overflow-x-hidden bg-[var(--seed-color-bg-layer-fill)] font-[var(--font-brand)] text-[var(--seed-color-fg-neutral)] antialiased [text-rendering:optimizeLegibility]`}
      >
        {children}
      </body>
    </html>
  );
}
