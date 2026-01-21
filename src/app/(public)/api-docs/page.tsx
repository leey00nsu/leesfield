import { ApiDocsScreen } from "@/screens/api-docs/ui/api-docs-screen";
import { getOpenApiDocumentForApiDocs } from "@/features/api-docs/model/openapi-document";

export default async function ApiDocsPage() {
  const openApiDocument = await getOpenApiDocumentForApiDocs();
  return <ApiDocsScreen openApiDocument={openApiDocument} />;
}
