import type { Metadata } from "next";
import { Asta_Sans } from "next/font/google";
import "./globals.css";

const astaSans = Asta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  fallback: ["Noto Sans KR", "Noto Sans", "sans-serif"],
});

export const metadata: Metadata = {
  title: "leesfield",
  description: "개인용 AI 생성 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${astaSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
