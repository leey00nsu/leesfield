"use client";
import { AppMotionEffects } from "@/shared/ui/app-motion-effects";



import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { CloseLabelProvider } from "@/shared/ui/close-label";
import { AppToaster } from "@/shared/ui/app-toast";

interface ProvidersProps {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
}

export function Providers({
  children,
  locale,
  messages,
  timeZone,
}: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      >
        <CloseLabelProvider>
          {children}
          <AppToaster />
          <AppMotionEffects />
        </CloseLabelProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
