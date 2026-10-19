import { z } from "zod";

export type PromptSource = {
  nodeId: string;
  kind: string;
  portId: string;
  text: string;
  executionId?: string;
  selectedItemId?: string | null;
  selectionVersion?: number;
  sources?: PromptSource[];
};

export type PromptProvenance = {
  localPrompt: string;
  connectedPrompt: string | null;
  sources: PromptSource[];
};

const sourceSchema: z.ZodType<PromptSource> = z.lazy(() => z.object({
  nodeId: z.string(), kind: z.string(), portId: z.string(), text: z.string(),
  executionId: z.string().optional(), selectedItemId: z.string().nullable().optional(),
  selectionVersion: z.number().int().nonnegative().optional(), sources: z.array(sourceSchema).max(500).optional(),
}));
export const promptProvenanceSchema = z.object({
  localPrompt: z.string(), connectedPrompt: z.string().nullable(), sources: z.array(sourceSchema).max(500),
});
