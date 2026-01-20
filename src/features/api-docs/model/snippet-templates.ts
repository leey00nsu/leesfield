export type SnippetLanguage = "curl" | "javascript" | "python";

export interface SnippetContext {
  baseUrl: string;
  path: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
  fileFields?: string[];
}

export const SNIPPET_API_KEY_PLACEHOLDER = "YOUR_API_KEY";

const defaultHeaders: Record<string, string> = {
  "X-API-Key": SNIPPET_API_KEY_PLACEHOLDER,
};

const snippetOrder: SnippetLanguage[] = ["curl", "javascript", "python"];

export const snippetLanguages = snippetOrder;

function serializeBody(body: unknown) {
  return body ?? {};
}

function stringifyBody(body: unknown) {
  return JSON.stringify(serializeBody(body), null, 2);
}

function formatBodyLiteral(body: unknown) {
  return JSON.stringify(serializeBody(body), null, 2);
}

function getHeaders(headers?: Record<string, string>, contentType?: string) {
  const merged = {
    ...defaultHeaders,
    ...headers,
  };
  if (contentType?.includes("multipart/form-data")) {
    delete merged["Content-Type"];
    return merged;
  }
  return {
    "Content-Type": contentType ?? "application/json",
    ...merged,
  };
}

function normalizeFormValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

type FormEntry = {
  key: string;
  value: string;
  isFile: boolean;
};

function buildFormEntries(
  body: unknown,
  fileFields: string[] = [],
): FormEntry[] {
  if (!body || typeof body !== "object") return [];
  const entries: FormEntry[] = [];
  Object.entries(body as Record<string, unknown>).forEach(([key, value]) => {
    const isFile = fileFields.includes(key);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        entries.push({
          key,
          value: normalizeFormValue(item),
          isFile,
        });
      });
      return;
    }
    entries.push({
      key,
      value: normalizeFormValue(value),
      isFile,
    });
  });
  return entries;
}

export function buildCurlSnippet(context: SnippetContext) {
  const { baseUrl, path, method, body, headers, contentType, fileFields } =
    context;
  if (contentType?.includes("multipart/form-data")) {
    const headerLines = Object.entries(getHeaders(headers, contentType))
      .map(([key, value]) => `-H "${key}: ${value}"`)
      .join(" \\\n  ");
    const formEntries = buildFormEntries(body, fileFields);
    const formLines = formEntries
      .map((entry) =>
        entry.isFile
          ? `-F "${entry.key}=@${entry.value}"`
          : `-F "${entry.key}=${entry.value}"`,
      )
      .join(" \\\n  ");
    const payload = formLines ? ` \\\n  ${formLines}` : "";
    return [
      `curl -X ${method.toUpperCase()} \"${baseUrl}${path}\" \\\n  ${headerLines}${payload}`,
    ]
      .join("")
      .trim();
  }

  const headerLines = Object.entries(getHeaders(headers, contentType))
    .map(([key, value]) => `-H "${key}: ${value}"`)
    .join(" \\\n  ");
  const bodyLine = body
    ? ` \\\n  -d '${stringifyBody(body)}'`
    : "";
  return [
    `curl -X ${method.toUpperCase()} \"${baseUrl}${path}\" \\\n  ${headerLines}${bodyLine}`,
  ]
    .join("")
    .trim();
}

export function buildJavascriptSnippet(context: SnippetContext) {
  const { baseUrl, path, method, body, headers, contentType, fileFields } =
    context;
  if (contentType?.includes("multipart/form-data")) {
    const formEntries = buildFormEntries(body, fileFields);
    const fileEntries = formEntries.filter((entry) => entry.isFile);
    const fileDeclarations = fileEntries
      .map(
        (entry, index) =>
          `const file${index} = new File([], \"${entry.value}\");`,
      )
      .join("\n");
    let fileIndex = 0;
    const formLines = formEntries
      .map((entry) => {
        if (entry.isFile) {
          const line = `formData.append(\"${entry.key}\", file${fileIndex});`;
          fileIndex += 1;
          return line;
        }
        return `formData.append(\"${entry.key}\", ${JSON.stringify(entry.value)});`;
      })
      .join("\n");
    const headerLines = JSON.stringify(
      getHeaders(headers, contentType),
      null,
      2,
    );
    return [
      `const formData = new FormData();\n` +
        (fileDeclarations ? `${fileDeclarations}\n\n` : "") +
        `${formLines}\n\n` +
        `const response = await fetch(\"${baseUrl}${path}\", {\n` +
        `  method: \"${method.toUpperCase()}\",\n` +
        `  headers: ${headerLines},\n` +
        `  body: formData,\n` +
        `});\n` +
        `const data = await response.json();`,
    ]
      .join("")
      .trim();
  }

  const combinedHeaders = getHeaders(headers, contentType);
  const bodyLine = body
    ? `  body: JSON.stringify(${formatBodyLiteral(body)}),\n`
    : "";
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
  const { baseUrl, path, method, body, headers, contentType, fileFields } =
    context;
  const combinedHeaders = getHeaders(headers, contentType);
  const methodName = method.toLowerCase();
  if (contentType?.includes("multipart/form-data")) {
    const formEntries = buildFormEntries(body, fileFields);
    const dataEntries = formEntries.filter((entry) => !entry.isFile);
    const fileEntries = formEntries.filter((entry) => entry.isFile);
    const dataBlock = `data = ${JSON.stringify(
      Object.fromEntries(
        dataEntries.map((entry) => [entry.key, entry.value]),
      ),
      null,
      2,
    )}`;
    const filesList = fileEntries.map(
      (entry) =>
        `[\"${entry.key}\", (\"${entry.value}\", open(\"${entry.value}\", \"rb\"))]`,
    );
    const filesBlock = `files = [\n  ${filesList.join(",\n  ")}\n]`;
    return [
      `import requests\n\n${dataBlock}\n${filesBlock}\n\n` +
        `response = requests.${methodName}(\"${baseUrl}${path}\", ` +
        `headers=${JSON.stringify(combinedHeaders, null, 2)}, ` +
        `data=data, files=files)\n` +
        "data = response.json()",
    ]
      .join("")
      .trim();
  }

  const payloadBlock = body
    ? `import json\n\npayload = json.loads('''${stringifyBody(body)}''')\n\n`
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
