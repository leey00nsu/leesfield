import { ZodError } from "zod";

import {
  createGenerationGraphSchema,
  updateGenerationGraphSchema,
} from "./generation-graph-contract";
import { GenerationGraphInputError, GenerationGraphStructureError } from "./generation-graph-errors";
import {
  generationGraphRepository,
  type GenerationGraphRepository,
} from "./generation-graph-repository";
import { validateGraphStructure } from "@/shared/generation-graph/graph-validation";

function parseInput<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new GenerationGraphInputError(error.flatten());
    }
    throw error;
  }
}

export function createGenerationGraphService(
  repository: GenerationGraphRepository = generationGraphRepository,
) {
  return {
    create(ownerEmail: string, body: unknown) {
      const input = parseInput(() => createGenerationGraphSchema.parse(body));
      return repository.create(ownerEmail, input.title);
    },

    list(ownerEmail: string) {
      return repository.list(ownerEmail);
    },

    get(ownerEmail: string, graphId: string) {
      return repository.get(ownerEmail, graphId);
    },

    update(ownerEmail: string, graphId: string, body: unknown) {
      const input = parseInput(() => updateGenerationGraphSchema.parse(body));
      const issues = validateGraphStructure(input);
      if (issues.length > 0) throw new GenerationGraphStructureError(issues);
      return repository.update(ownerEmail, graphId, input);
    },

    remove(ownerEmail: string, graphId: string) {
      return repository.remove(ownerEmail, graphId);
    },
  };
}

export const generationGraphService = createGenerationGraphService();
