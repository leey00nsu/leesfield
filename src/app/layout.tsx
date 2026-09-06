import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/app/providers";
import "./globals.css";

const paperlogy = localFont({
  src: "./fonts/Paperlogy-7Bold.ttf",
  variable: "--font-paperlogy",
  display: "swap",
  weight: "700",
});

const pretendard = localFont({
  src: "./fonts/pretendard-variable.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "45 920",
  fallback: ["Noto Sans KR", "Noto Sans", "sans-serif"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const description =
    locale === "ko"
      ? "여러 AI 모델을 하나의 실행 환경에서. Runtime model catalog, 비동기 job, 모델별 동시성 제어와 외부 API·운영 모니터링을 제공하는 AI inference platform."
      : "An AI inference platform with a runtime model catalog, asynchronous jobs, model concurrency control, API-key access, and operational monitoring.";
  return {
    title: {
      default: "leesfield",
      template: "%s | leesfield",
    },
    description,
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: [
        {
          url: "/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    openGraph: {
      title: "leesfield",
      description,
      type: "website",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "leesfield",
      description,
      images: ["/opengraph-image"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#347ff4",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = "UTC";

  return (
    <html lang={locale} className="dark">
      <body className={`${pretendard.variable} ${paperlogy.variable} antialiased`}>
        <Providers locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
