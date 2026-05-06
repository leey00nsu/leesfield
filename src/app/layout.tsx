import type { Metadata, Viewport } from "next";
import { Nanum_Myeongjo } from "next/font/google";
import localFont from "next/font/local";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/app/providers";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/pretendard-variable.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "45 920",
  fallback: ["Noto Sans KR", "Noto Sans", "sans-serif"],
});

const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "700", "800"],
  subsets: ["latin"],
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: {
    default: "leesfield",
    template: "%s | leesfield",
  },
  description: "개인용 AI 생성 플랫폼",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
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
    description: "개인용 AI 생성 플랫폼",
    type: "website",
    images: [{ url: "/logo.webp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "leesfield",
    description: "개인용 AI 생성 플랫폼",
    images: ["/logo.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#d4f032",
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
      <body className={`${pretendard.variable} ${nanumMyeongjo.variable} antialiased`}>
        <Providers locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
