import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "사주 자동 분석",
  description: "입력 정보를 기반으로 자동 분석 후 이메일로 결과를 발송합니다.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
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
