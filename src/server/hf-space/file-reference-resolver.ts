export type HfSpaceFileReferenceKind =
  | "data_url"
  | "absolute_url"
  | "gradio_file_url"
  | "legacy_gradio_file_url"
  | "space_path"
  | "bare_filename";

export type HfSpaceResolvedFileReference = {
  kind: HfSpaceFileReferenceKind;
  value: string;
  normalizedUrl: string;
};

export type HfSpaceResolvedFileReferenceGroup = {
  assetKey: string;
  candidates: HfSpaceResolvedFileReference[];
};

type ExtractableFileReference = {
  url?: unknown;
  path?: unknown;
  name?: unknown;
  data?: unknown;
};

type CollectOptions = {
  matcher?: (value: string) => boolean;
  maxDepth?: number;
};

type ResolveCandidateOptions = CollectOptions & {
  spaceUrl: string;
};

type PreparedCandidate = HfSpaceResolvedFileReference & {
  assetKey: string;
  assetName: string | null;
  priority: number;
};

const GRADIO_FILE_EQUALS_PREFIX = "/gradio_api/file=";
const GRADIO_FILE_SLASH_PREFIX = "/gradio_api/file/";
const LEGACY_FILE_EQUALS_PREFIX = "/file=";
const LEGACY_FILE_BARE_PREFIX = "file=";
const LEGACY_FILE_SLASH_PREFIX = "/file/";

function trim(value: string) {
  return value.trim();
}

function isAbsoluteHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function getBaseUrl(spaceUrl: string) {
  return spaceUrl.endsWith("/") ? spaceUrl.slice(0, -1) : spaceUrl;
}

function getOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getPathBasename(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

function looksLikeBareFilename(value: string) {
  return (
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("file=") &&
    !value.includes("?") &&
    value.length > 0
  );
}

function getPriority(kind: HfSpaceFileReferenceKind) {
  switch (kind) {
    case "data_url":
      return 100;
    case "absolute_url":
      return 90;
    case "gradio_file_url":
      return 80;
    case "legacy_gradio_file_url":
      return 70;
    case "space_path":
      return 60;
    case "bare_filename":
      return 10;
  }
}

function extractResourcePath(kind: HfSpaceFileReferenceKind, value: string) {
  switch (kind) {
    case "absolute_url": {
      try {
        const url = new URL(value);
        const pathname = `${url.pathname}${url.search}`;
        if (pathname.startsWith(GRADIO_FILE_EQUALS_PREFIX)) {
          return pathname.slice(GRADIO_FILE_EQUALS_PREFIX.length);
        }
        if (pathname.startsWith(GRADIO_FILE_SLASH_PREFIX)) {
          return pathname.slice(GRADIO_FILE_SLASH_PREFIX.length - 1);
        }
        if (pathname.startsWith(LEGACY_FILE_SLASH_PREFIX)) {
          return pathname.slice(LEGACY_FILE_SLASH_PREFIX.length - 1);
        }
        return pathname;
      } catch {
        return value;
      }
    }
    case "gradio_file_url":
      if (value.startsWith(GRADIO_FILE_EQUALS_PREFIX)) {
        return value.slice(GRADIO_FILE_EQUALS_PREFIX.length);
      }
      if (value.startsWith(GRADIO_FILE_SLASH_PREFIX)) {
        return value.slice(GRADIO_FILE_SLASH_PREFIX.length - 1);
      }
      return value;
    case "legacy_gradio_file_url":
      if (value.startsWith(LEGACY_FILE_EQUALS_PREFIX)) {
        return value.slice(LEGACY_FILE_EQUALS_PREFIX.length);
      }
      if (value.startsWith(LEGACY_FILE_BARE_PREFIX)) {
        return value.slice(LEGACY_FILE_BARE_PREFIX.length);
      }
      if (value.startsWith(LEGACY_FILE_SLASH_PREFIX)) {
        return value.slice(LEGACY_FILE_SLASH_PREFIX.length - 1);
      }
      return value;
    case "space_path":
      return value;
    case "bare_filename":
      return value;
    case "data_url":
      return null;
  }
}

export function extractHfSpaceFileReference(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const normalized = trim(value);
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value !== "object") return null;

  const candidate = value as ExtractableFileReference;
  if (typeof candidate.data === "string" && candidate.data.startsWith("data:")) {
    return candidate.data;
  }
  if (typeof candidate.url === "string") return trim(candidate.url);
  if (typeof candidate.path === "string") return trim(candidate.path);
  if (typeof candidate.name === "string") return trim(candidate.name);
  return null;
}

export function collectHfSpaceFileReferences(
  value: unknown,
  options: CollectOptions = {},
): string[] {
  const matcher = options.matcher ?? (() => true);
  const maxDepth = options.maxDepth ?? 4;
  const refs: string[] = [];
  const seen = new Set<string>();

  function visit(current: unknown, depth: number) {
    if (depth > maxDepth || current === null || current === undefined) return;

    const direct = extractHfSpaceFileReference(current);
    if (direct && matcher(direct) && !seen.has(direct)) {
      seen.add(direct);
      refs.push(direct);
    }

    if (typeof current === "string" || typeof current !== "object") return;

    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, depth + 1));
      return;
    }

    Object.values(current as Record<string, unknown>).forEach((item) =>
      visit(item, depth + 1),
    );
  }

  visit(value, 0);
  return refs;
}

export function resolveHfSpaceFileReference(
  value: string,
  spaceUrl: string,
): HfSpaceResolvedFileReference {
  const fileRef = trim(value);
  const baseUrl = getBaseUrl(spaceUrl);

  if (fileRef.startsWith("data:")) {
    return { kind: "data_url", value: fileRef, normalizedUrl: fileRef };
  }

  if (isAbsoluteHttpUrl(fileRef)) {
    return { kind: "absolute_url", value: fileRef, normalizedUrl: fileRef };
  }

  if (
    fileRef.startsWith(GRADIO_FILE_EQUALS_PREFIX) ||
    fileRef.startsWith(GRADIO_FILE_SLASH_PREFIX)
  ) {
    return {
      kind: "gradio_file_url",
      value: fileRef,
      normalizedUrl: `${baseUrl}${fileRef}`,
    };
  }

  if (fileRef.startsWith(LEGACY_FILE_EQUALS_PREFIX)) {
    return {
      kind: "legacy_gradio_file_url",
      value: fileRef,
      normalizedUrl: `${baseUrl}/gradio_api${fileRef}`,
    };
  }

  if (fileRef.startsWith(LEGACY_FILE_BARE_PREFIX)) {
    return {
      kind: "legacy_gradio_file_url",
      value: fileRef,
      normalizedUrl: `${baseUrl}/gradio_api/${fileRef}`,
    };
  }

  if (fileRef.startsWith(LEGACY_FILE_SLASH_PREFIX)) {
    return {
      kind: "legacy_gradio_file_url",
      value: fileRef,
      normalizedUrl: `${baseUrl}${fileRef}`,
    };
  }

  if (looksLikeBareFilename(fileRef)) {
    return {
      kind: "bare_filename",
      value: fileRef,
      normalizedUrl: `${baseUrl}/gradio_api/file=${fileRef}`,
    };
  }

  return {
    kind: "space_path",
    value: fileRef,
    normalizedUrl: `${baseUrl}/gradio_api/file=${fileRef}`,
  };
}

function prepareCandidate(
  value: string,
  canonicalBaseUrl: string,
): PreparedCandidate {
  const resolved = resolveHfSpaceFileReference(value, canonicalBaseUrl);
  const resourcePath = extractResourcePath(resolved.kind, resolved.value);
  const assetName = resourcePath ? getPathBasename(resourcePath) : null;

  return {
    ...resolved,
    assetKey:
      resolved.kind === "data_url"
        ? resolved.normalizedUrl
        : resourcePath || resolved.normalizedUrl,
    assetName,
    priority: getPriority(resolved.kind),
  };
}

export function resolveHfSpaceFileReferenceCandidates(
  value: unknown,
  options: ResolveCandidateOptions,
): HfSpaceResolvedFileReferenceGroup[] {
  const refs = collectHfSpaceFileReferences(value, options);
  if (refs.length === 0) {
    return [];
  }

  const fallbackBaseUrl = getBaseUrl(options.spaceUrl);
  const canonicalBaseUrl =
    refs.map(getOrigin).find((origin): origin is string => Boolean(origin)) ??
    fallbackBaseUrl;

  const prepared = refs.map((ref) => prepareCandidate(ref, canonicalBaseUrl));
  const nonBareCandidates = prepared.filter(
    (candidate) => candidate.kind !== "bare_filename",
  );
  const assetKeysByName = new Map<string, string>();

  nonBareCandidates.forEach((candidate) => {
    if (!candidate.assetName || assetKeysByName.has(candidate.assetName)) {
      return;
    }
    assetKeysByName.set(candidate.assetName, candidate.assetKey);
  });

  const groups = new Map<string, PreparedCandidate[]>();
  const addToGroup = (candidate: PreparedCandidate) => {
    const current = groups.get(candidate.assetKey) ?? [];
    if (!current.some((item) => item.normalizedUrl === candidate.normalizedUrl)) {
      current.push(candidate);
      current.sort((left, right) => right.priority - left.priority);
      groups.set(candidate.assetKey, current);
    }
  };

  nonBareCandidates.forEach(addToGroup);

  prepared
    .filter((candidate) => candidate.kind === "bare_filename")
    .forEach((candidate) => {
      if (candidate.assetName && assetKeysByName.has(candidate.assetName)) {
        return;
      }
      addToGroup(candidate);
    });

  return Array.from(groups.entries())
    .map(([assetKey, candidates]) => ({
      assetKey,
      candidates: candidates.map(({ kind, value, normalizedUrl }) => ({
        kind,
        value,
        normalizedUrl,
      })),
    }))
    .sort((left, right) => {
      const leftPriority =
        groups.get(left.assetKey)?.[0]?.priority ?? Number.NEGATIVE_INFINITY;
      const rightPriority =
        groups.get(right.assetKey)?.[0]?.priority ?? Number.NEGATIVE_INFINITY;
      return rightPriority - leftPriority;
    });
}

export function selectPreferredHfSpaceFileReference(
  value: unknown,
  options: ResolveCandidateOptions,
) {
  return resolveHfSpaceFileReferenceCandidates(value, options)[0]?.candidates[0] ?? null;
}

export function normalizeHfSpaceFileUrl(value: string, spaceUrl: string) {
  return resolveHfSpaceFileReference(value, spaceUrl).normalizedUrl;
}
