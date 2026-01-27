import type { PropsWithChildren } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import koMessages from "@/shared/i18n/messages/ko.json";

export const defaultLocale = "ko";
export const defaultMessages = koMessages as AbstractIntlMessages;

export function IntlProvider({
  children,
  locale = defaultLocale,
  messages = defaultMessages,
}: PropsWithChildren<{
  locale?: string;
  messages?: AbstractIntlMessages;
}>) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(
  ui: Parameters<typeof render>[0],
  options?: Parameters<typeof render>[1] & {
    locale?: string;
    messages?: AbstractIntlMessages;
  },
) {
  const { locale, messages, ...rest } = options ?? {};
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale={locale} messages={messages}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    ),
    ...rest,
  });
}

export function createIntlWrapper(
  locale: string = defaultLocale,
  messages: AbstractIntlMessages = defaultMessages,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  };
}
