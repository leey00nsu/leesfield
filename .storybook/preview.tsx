import type { Preview } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import koMessages from "../src/shared/i18n/messages/ko.json";
import "../src/app/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

const preview: Preview = {
  decorators: [
    (Story) => (
      <NextIntlClientProvider
        locale="ko"
        messages={koMessages}
        timeZone="Asia/Seoul"
      >
        <QueryClientProvider client={queryClient}>
          <div
            className="dark min-h-screen bg-background text-foreground antialiased"
            style={{
              "--font-body":
                "Pretendard, Noto Sans KR, Noto Sans, ui-sans-serif, system-ui, sans-serif",
              "--font-heading": "Georgia, Times New Roman, serif",
            }}
          >
            <Story />
          </div>
        </QueryClientProvider>
      </NextIntlClientProvider>
    ),
  ],
  parameters: {
    backgrounds: {
      default: "leesfield dark",
      values: [
        { name: "leesfield dark", value: "#0a0a0a" },
        { name: "editorial page", value: "#07090a" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
};

export default preview;
