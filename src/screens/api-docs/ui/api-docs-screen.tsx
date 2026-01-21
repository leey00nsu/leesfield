import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import { ApiDocsWidget } from "@/widgets/api-docs/ui/api-docs-widget";

interface ApiDocsScreenProps {
  openApiDocument: OpenApiDocument;
}

export function ApiDocsScreen({ openApiDocument }: ApiDocsScreenProps) {
  return <ApiDocsWidget openApiDocument={openApiDocument} />;
}
