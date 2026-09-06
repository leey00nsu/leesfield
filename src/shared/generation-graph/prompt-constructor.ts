export type PromptVariable = { name: string; value: string; nodeId: string };
export type PromptSource = { id: string; kind: string; text: string; variableName?: string };

// Matches the upstream named-variable-first, then inline-tag precedence.
export function promptVariables(sources: readonly PromptSource[]): PromptVariable[] {
  const variables = new Map<string, PromptVariable>();
  for (const source of sources) {
    if (source.kind === "input.prompt" && source.variableName) {
      variables.set(source.variableName, { name: source.variableName, value: source.text, nodeId: source.id });
    }
  }
  for (const source of sources) {
    for (const match of source.text.matchAll(/<var="(\w+)">([\s\S]*?)<\/var>/g)) {
      if (!variables.has(match[1])) variables.set(match[1], { name: match[1], value: match[2], nodeId: `${source.id}-var-${match[1]}` });
    }
  }
  return [...variables.values()];
}

export function constructPrompt(template: string, sources: readonly PromptSource[]): string {
  const values = new Map(promptVariables(sources).map(({ name, value }) => [name, value]));
  let length = 0;
  const result = template.replace(/@(\w+)/g, (token, name: string) => {
    const value = values.get(name) ?? token;
    length += value.length;
    if (length > 20_000) throw new Error("PROMPT_OUTPUT_TOO_LARGE");
    return value;
  });
  if (result.length > 20_000) throw new Error("PROMPT_OUTPUT_TOO_LARGE");
  return result;
}

type TextGraph = {
  nodes: readonly { id: string; kind: string; config: unknown }[];
  edges: readonly { sourceNodeId: string; targetNodeId: string; targetPortId: string; sortOrder?: number; hasPause?: boolean }[];
};
function configOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function resolveGraphText(graph: TextGraph, nodeId: string, visited = new Set<string>()): string {
  if (visited.has(nodeId)) throw new Error("PROMPT_INPUT_CYCLE");
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return "";
  const config = configOf(node.config);
  const next = new Set(visited).add(nodeId);
  const incoming = graph.edges.filter((edge) => edge.targetNodeId === nodeId && edge.targetPortId === "text" && (node.kind === "input.prompt" || !edge.hasPause))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (node.kind === "input.prompt") return incoming.length
    ? resolveGraphText(graph, incoming[0].sourceNodeId, next) : typeof config.text === "string" ? config.text : "";
  if (node.kind !== "process.promptConstructor") return "";
  return constructPrompt(typeof config.template === "string" ? config.template : "", incoming.flatMap((edge) => {
    const source = graph.nodes.find((candidate) => candidate.id === edge.sourceNodeId);
    if (!source) return [];
    const variableName = configOf(source.config).variableName;
    return [{ id: source.id, kind: source.kind, text: resolveGraphText(graph, source.id, next),
      ...(typeof variableName === "string" ? { variableName } : {}) }];
  }));
}
