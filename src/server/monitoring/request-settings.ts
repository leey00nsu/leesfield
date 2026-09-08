type Value =
  string | number | boolean | null | Value[] | { [key: string]: Value };
const metadata = new Set([
  "model",
  "prompt",
  "referenceText",
  "graphId",
  "graphNodeId",
  "inputAssets",
  "initImage",
  "initImages",
  "inputAudio",
  "inputAudios",
]);
const sensitive =
  /(?:api[_-]?key|authorization|password|secret|^(?:token|access[_-]?token|refresh[_-]?token|auth[_-]?token|hf[_-]?token)$|credential|providerConfig|__proto__|constructor|prototype)/i;

function clean(value: unknown, depth = 0): Value {
  if (depth > 8) return "[omitted]";
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string") {
    if (
      ["data:", "blob:", "https://", "http://", "/"].some((prefix) =>
        value.toLowerCase().startsWith(prefix),
      )
    )
      return "[file]";
    return value.length > 4000 ? value.slice(0, 4000) + "…" : value;
  }
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitive.test(key))
        .map(([key, item]) => [key, clean(item, depth + 1)]),
    );
  return null;
}

/** Display the persisted submission, never current catalog defaults or provider credentials. */
export function requestSettings(
  snapshot: unknown,
): Record<string, Value> | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return null;
  const stored = snapshot as Record<string, unknown>;
  if (stored.requestSettings && typeof stored.requestSettings === "object" && !Array.isArray(stored.requestSettings)) {
    return clean(Object.fromEntries(Object.entries(stored.requestSettings).filter(([key]) => !metadata.has(key)))) as Record<string, Value>;
  }
  if (stored.requestVersion === 2) {
    const values = stored.dynamicParams && typeof stored.dynamicParams === "object" ? stored.dynamicParams as Record<string, unknown> : {};
    const result: Record<string, Value> = {};
    for (const item of Array.isArray(stored.parameterDefinitions) ? stored.parameterDefinitions : []) {
      if (!item || typeof item !== "object") continue;
      const def = item as Record<string, unknown>;
      if (typeof def.key !== "string" || typeof def.name !== "string" || sensitive.test(def.key) || sensitive.test(def.name) || metadata.has(def.name) || def.name === "initImagesCount" || !Object.hasOwn(values,def.key)) continue;
      result[Object.hasOwn(result,def.name) ? def.key : def.name] = clean(values[def.key]);
    }
    return result;
  }
  const result = Object.fromEntries(
    Object.entries(snapshot)
      .filter(
        ([key, value]) =>
          !metadata.has(key) && !sensitive.test(key) && value !== undefined,
      )
      .map(([key, value]) => [key, clean(value)]),
  );
  return Object.keys(result).length ? result : null;
}
