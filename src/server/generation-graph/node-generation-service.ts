import { ZodError } from "zod";

import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import { submitImageGeneration } from "@/server/image-generation/image-generation-submission";
import { validateImageGenerationPayload } from "@/server/model-catalog/generation-validation";

import {
  executeNodeGenerationSchema,
  type NodeGenerationDto,
} from "./node-generation-contract";
import {
  imageGenerationConfigV1Schema,
  type ImageGenerationConfigV1,
} from "./generation-graph-contract";
import {
  NodeGenerationConfigError,
  NodeGenerationInputError,
  NodeGenerationVersionConflictError,
  NodeInputLimitExceededError,
  NodeInputUnsupportedError,
} from "./node-generation-errors";
import { resolveNodeInputs } from "./node-input-resolution";
import {
  nodeGenerationRepository,
  type NodeGenerationRepository,
} from "./node-generation-repository";

type ValidatePayload = typeof validateImageGenerationPayload;
type SubmitGeneration = typeof submitImageGeneration;

function parseExecutionInput(body: unknown) {
  try {
    return executeNodeGenerationSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new NodeGenerationInputError(error.flatten());
    }
    throw error;
  }
}

function parseNodeConfig(config: unknown) {
  const parsed = imageGenerationConfigV1Schema.safeParse(config);
  if (!parsed.success) {
    throw new NodeGenerationConfigError(parsed.error.flatten());
  }
  return parsed.data;
}

export function imageNodeConfigToGenerationPayload(
  config: ImageGenerationConfigV1,
  initImages: string[] = [],
) {
  const parameters = config.parameters;
  return {
    prompt: config.prompt,
    model: config.modelKey,
    width: parameters.width,
    height: parameters.height,
    imageCount: parameters.imageCount,
    steps: parameters.steps,
    modeChoice: parameters.modeChoice,
    guidanceScale: parameters.guidanceScale,
    promptUpsampling: parameters.promptUpsampling,
    seed: parameters.seed,
    initImages,
  };
}

function mapInputCapabilityError(error: ZodError) {
  const issue = Array.isArray(error.issues)
    ? error.issues.find((candidate) => candidate.path[0] === "initImages")
    : undefined;
  const params = issue && "params" in issue
    ? issue.params as Record<string, unknown> | undefined
    : undefined;
  const count = typeof params?.count === "number" ? params.count : 0;
  const limit = typeof params?.limit === "number" ? params.limit : 0;

  if (params?.nodeInputReason === "unsupported") {
    return new NodeInputUnsupportedError({ limit: 0, count });
  }
  if (params?.nodeInputReason === "limit_exceeded") {
    return new NodeInputLimitExceededError({ limit, count });
  }
  return null;
}

export function createNodeGenerationService(
  repository: NodeGenerationRepository = nodeGenerationRepository,
  validatePayload: ValidatePayload = validateImageGenerationPayload,
  submitGeneration: SubmitGeneration = submitImageGeneration,
) {
  return {
    async execute(
      ownerEmail: string,
      graphId: string,
      nodeId: string,
      body: unknown,
    ) {
      const input = parseExecutionInput(body);
      const node = await repository.getOwnedNode(ownerEmail, graphId, nodeId);
      if (node.graph.version !== input.expectedGraphVersion) {
        throw new NodeGenerationVersionConflictError();
      }
      if (node.type !== "imageGeneration" || node.configVersion !== 1) {
        throw new NodeGenerationConfigError({ node: ["NODE_TYPE_UNSUPPORTED"] });
      }

      const config = parseNodeConfig(node.config);
      const resolvedInputs = resolveNodeInputs(ownerEmail, node.incomingEdges);
      const candidate = imageNodeConfigToGenerationPayload(
        config,
        resolvedInputs.map((input) => input.url),
      );
      const validated = await validatePayload(candidate);
      if (!validated.success) {
        const inputError = mapInputCapabilityError(validated.error);
        if (inputError) throw inputError;
        throw new NodeGenerationConfigError(validated.error.flatten());
      }

      return submitGeneration({
        payload: validated.data as ImageGenerationFormValues,
        ownerEmail,
        graphNodeId: node.id,
      });
    },

    async list(ownerEmail: string, graphId: string, nodeId: string) {
      const records = await repository.list(ownerEmail, graphId, nodeId, 20);
      return records.map(
        (record): NodeGenerationDto => ({
          ...record,
          createdAt: record.createdAt.toISOString(),
        }),
      );
    },
  };
}

export const nodeGenerationService = createNodeGenerationService();
