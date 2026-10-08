import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import { ApiDocsWidget } from "@/widgets/api-docs/ui/api-docs-widget";

interface ApiDocsScreenProps {
  openApiDocument: OpenApiDocument;
}

export function ApiDocsScreen({ openApiDocument }: ApiDocsScreenProps) {
  return (
    <div className="-mx-4 flex-1 sm:-mx-6 lg:-mx-8">
      <ApiDocsWidget openApiDocument={openApiDocument} />
    </div>
  );
}
