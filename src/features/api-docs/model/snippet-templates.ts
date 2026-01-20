export type SnippetLanguage = "curl" | "javascript" | "python";

export interface SnippetContext {
  baseUrl: string;
  path: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export const SNIPPET_API_KEY_PLACEHOLDER = "YOUR_API_KEY";

const defaultHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  "X-API-Key": SNIPPET_API_KEY_PLACEHOLDER,
};

const snippetOrder: SnippetLanguage[] = ["curl", "javascript", "python"];

export const snippetLanguages = snippetOrder;

function serializeBody(body: unknown) {
  return JSON.stringify(body ?? {}, null, 2);
}

function getHeaders(headers?: Record<string, string>) {
  return {
    ...defaultHeaders,
    ...headers,
  };
}

export function buildCurlSnippet(context: SnippetContext) {
  const { baseUrl, path, method, body, headers } = context;
  const headerLines = Object.entries(getHeaders(headers))
    .map(([key, value]) => `-H "${key}: ${value}"`)
    .join(" \\\n  ");
  const bodyLine = body
    ? ` \\\n  -d '${serializeBody(body)}'`
    : "";
  return [
    `curl -X ${method.toUpperCase()} \"${baseUrl}${path}\" \\\n  ${headerLines}${bodyLine}`,
  ]
    .join("")
    .trim();
}

export function buildJavascriptSnippet(context: SnippetContext) {
  const { baseUrl, path, method, body, headers } = context;
  const combinedHeaders = getHeaders(headers);
  const bodyLine = body ? `  body: JSON.stringify(${serializeBody(body)}),\n` : "";
  return [
    `const response = await fetch(\"${baseUrl}${path}\", {\n` +
      `  method: \"${method.toUpperCase()}\",\n` +
      `  headers: ${JSON.stringify(combinedHeaders, null, 2)},\n` +
      bodyLine +
      `});\n` +
      `const data = await response.json();`,
  ]
    .join("")
    .trim();
}

export function buildPythonSnippet(context: SnippetContext) {
  const { baseUrl, path, method, body, headers } = context;
  const combinedHeaders = getHeaders(headers);
  const methodName = method.toLowerCase();
  const payloadBlock = body
    ? `import json\n\npayload = json.loads('''${serializeBody(body)}''')\n\n`
    : "";
  const bodyLine = body ? "json=payload, " : "";
  return [
    `import requests\n\n${payloadBlock}` +
      `response = requests.${methodName}(\"${baseUrl}${path}\", ${bodyLine}` +
      `headers=${JSON.stringify(combinedHeaders, null, 2)})\n` +
      "data = response.json()",
  ]
    .join("")
    .trim();
}

export function buildSnippet(
  language: SnippetLanguage,
  context: SnippetContext,
) {
  switch (language) {
    case "curl":
      return buildCurlSnippet(context);
    case "javascript":
      return buildJavascriptSnippet(context);
    case "python":
      return buildPythonSnippet(context);
    default:
      return buildCurlSnippet(context);
  }
}
