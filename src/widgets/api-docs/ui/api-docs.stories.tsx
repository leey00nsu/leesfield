import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import { getOpenApiTranslations } from "@/features/api-docs/model/openapi-translations";
import koMessages from "@/shared/i18n/messages/ko.json";
import { ApiDocsWidget } from "./api-docs-widget";

const meta = {
  title: "Project Design/API Docs/Reference",
  component: ApiDocsWidget,
  args: { openApiDocument: getOpenApiDocument(getOpenApiTranslations(koMessages)) },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ApiDocsWidget>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Mobile: Story = {
  decorators: [
    (Story) => <div style={{ width: 390, maxWidth: "100%" }}><Story /></div>,
  ],
};
