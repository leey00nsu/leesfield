import type { PropsWithChildren } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { render } from "@testing-library/react";
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
  return render(ui, {
    wrapper: ({ children }) => (
      <IntlProvider locale={locale} messages={messages}>
        {children}
      </IntlProvider>
    ),
    ...rest,
  });
}

export function createIntlWrapper(
  locale: string = defaultLocale,
  messages: AbstractIntlMessages = defaultMessages,
) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  };
}
