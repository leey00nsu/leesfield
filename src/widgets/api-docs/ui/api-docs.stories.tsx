import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import { ApiDocsSidebar } from "@/widgets/api-docs/ui/api-docs-sidebar";

const apiSections: ApiSection[] = [
  {
    id: "image-generation",
    title: "Image generation",
    operations: [
      {
        id: "post-v2-image-generate",
        method: "POST",
        path: "/v2/image/generate",
        description:
          "Generate images from prompts with model, aspect ratio, and style control.",
        request: {
          contentType: "application/json",
          schema: null,
          properties: [
            {
              name: "prompt",
              typeLabel: "string",
              description: "Text prompt describing the desired image.",
              required: true,
            },
            {
              name: "model",
              typeLabel: "string",
              description: "Model identifier used for generation.",
              required: true,
            },
            {
              name: "aspect_ratio",
              typeLabel: "enum",
              description: "Output image aspect ratio.",
              required: false,
            },
          ],
        },
        responses: [
          {
            status: "200",
            description: "Request accepted",
            schema: null,
            example: {
              requestId: "req_001",
              status: "processing",
              progress: 42,
            },
          },
          {
            status: "400",
            description: "Invalid request",
            schema: null,
            example: {
              message: "INVALID_REQUEST",
              errors: {
                fieldErrors: {
                  prompt: ["Prompt cannot be empty."],
                },
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: "history",
    title: "History",
    operations: [
      {
        id: "get-v1-history",
        method: "GET",
        path: "/v1/history",
        description: "List previous generation requests.",
        request: null,
        responses: [
          {
            status: "200",
            description: "History list",
            schema: null,
            example: {
              items: [],
              total: 0,
            },
          },
        ],
      },
    ],
  },
];

function ApiDocsPreview() {
  return (
    <div className="min-h-screen bg-background-dark p-6 text-white">
      <div className="mx-auto flex max-w-7xl gap-6">
        <ApiDocsSidebar apiVersion="1.0.0" apiSections={apiSections} />
        <main className="min-w-0 flex-1">
          <ApiDocsEndpointsSection
            apiVersion="1.0.0"
            apiSections={apiSections}
            openApiDocument={null}
          />
        </main>
      </div>
    </div>
  );
}

const meta = {
  title: "Project Design/API Docs/Reference",
  component: ApiDocsPreview,
} satisfies Meta<typeof ApiDocsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
