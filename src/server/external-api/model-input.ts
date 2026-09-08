import {
  parameterKind,
  parameterValueIssue,
} from "@/shared/model-catalog/parameter-contract";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { SchemaObject } from "openapi3-ts/oas31";
import { getModelGenerationSchema } from "@/server/model-catalog/generation-validation";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import {
  getGradioContract,
  gradioInputValues,
  assertGradioExecutable,
} from "@/shared/model-catalog/gradio-contract";
import {
  maxExternalFileBytes,
  externalFilePrefix,
} from "@/shared/api/external-contract";
import { normalizeRuntimeParameterOptions } from "@/shared/model-catalog/parameter-options";

type FileInput = {
  name: string;
  multiple: boolean;
  multipartField: string;
  maxBytes: number;
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function fileInput(name: string, multiple: boolean): FileInput {
  return {
    name,
    multiple,
    multipartField: externalFilePrefix + name,
    maxBytes: maxExternalFileBytes,
  };
}

/** The authenticated schema and submission parser share the same model contract. */
export function getExternalModelInput(model: ModelCatalogItem) {
  const runtime = getModelGenerationSchema(model);
  const contract = getGradioContract(model);
  const files: FileInput[] = [];
  const defaults: Record<string, unknown> = {};
  const stringAdapters = new Set<string>();
  let inputSchema: SchemaObject;
  if (contract) {
    const properties: Record<string, SchemaObject> = {};
    const required: string[] = [];
    for (const field of contract.inputs) {
      let schema: SchemaObject;
      if (["file", "files", "gallery"].includes(field.kind)) {
        const multiple = field.kind !== "file";
        files.push(fileInput(field.name, multiple));
        schema = multiple
          ? { type: "array", items: { type: "string" } }
          : { type: "string" };
        schema.description =
          "File URL or data URL; alternatively use the declared multipart file field.";
      } else {
        schema = {
          ...(field.kind !== "json"
            ? { type: field.kind as "string" | "number" | "boolean" }
            : {}),
          allOf: [
            {
              ...field.schema,
              $id:
                "urn:leesfield:" +
                encodeURIComponent(model.id) +
                ":" +
                encodeURIComponent(field.name),
            } as SchemaObject,
          ],
        };
      }
      if (field.choices?.length) schema.enum = field.choices;
      if (field.min !== undefined) schema.minimum = field.min;
      if (field.max !== undefined) schema.maximum = field.max;
      if (field.step !== undefined) {
        schema["x-step"] = field.step;
        schema["x-step-base"] = field.min ?? 0;
      }
      if (field.nullable) schema = { anyOf: [schema, { type: "null" }] };
      if (field.default !== undefined) {
        schema.default = field.default;
        defaults[field.name] = field.default;
      }
      schema.title = field.label;
      properties[field.name] = schema;
      if (field.required && field.default === undefined)
        required.push(field.name);
    }
    inputSchema = {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  } else {
    const registry = new OpenAPIRegistry();
    registry.register("Input", runtime);
    const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
      openapi: "3.1.0",
      info: { title: "Input", version: "1" },
    });
    const legacy = doc.components!.schemas!.Input as SchemaObject;
    const properties: Record<string, SchemaObject> = {};
    const required = new Set(
      (legacy.required ?? []).filter(
        (key) => key !== "model" && key !== "dynamicParams",
      ),
    );
    const configs = object(model.parameters);
    const allowed = new Set([...Object.keys(configs), ...required]);
    if (model.type === "image" && Number(model.meta.max_input_images) > 0)
      allowed.add("initImages");
    if (model.type === "video" && model.meta.supports_init_image) {
      allowed.add("initImage");
      required.add("initImage");
    }
    if (model.type === "audio" && model.meta.supports_input_audio)
      allowed.add("inputAudio");
    for (const name of allowed) {
      if (
        [
          "model",
          "dynamicParams",
          "__proto__",
          "constructor",
          "prototype",
        ].includes(name)
      )
        continue;
      const config = object(configs[name]),
        binding = object(config.binding);
      let schema = legacy.properties?.[name] as SchemaObject | undefined;
      if (!schema && binding.source === "hf_space") {
        const kind =
          binding.valueType === "file" ? "string" : binding.valueType;
        schema = {
          type: typeof kind === "string" ? (kind as "string") : "string",
        };
        if (typeof config.min === "number") schema.minimum = config.min;
        if (typeof config.max === "number") schema.maximum = config.max;
        if (typeof config.step === "number") {
          schema["x-step"] = config.step;
          schema["x-step-base"] = config.min ?? 0;
        }
        const options = normalizeRuntimeParameterOptions(config.options);
        if (options) schema.enum = options.map((option) => option.value);
        if (config.required === true) required.add(name);
      }
      if (!schema) continue;
      schema = { ...schema };
      const kind = parameterKind(name, config);
      const stringSchema =
        schema.type === "string" ||
        (schema.anyOf?.length &&
          schema.anyOf.every(
            (part) => (part as SchemaObject).type === "string",
          ));
      if (stringSchema && (kind === "number" || kind === "boolean")) {
        stringAdapters.add(name);
        schema = { type: kind };
      }
      if (kind === "number") {
        if (typeof config.min === "number") schema.minimum = config.min;
        if (typeof config.max === "number") schema.maximum = config.max;
        if (typeof config.step === "number") {
          schema["x-step"] = config.step;
          schema["x-step-base"] = config.min ?? 0;
        }
      }
      const choices = normalizeRuntimeParameterOptions(config.options);
      if (choices?.length) schema.enum = choices.map((option) => option.value);
      if (config.default !== undefined) {
        defaults[name] = config.default;
        schema.default = config.default;
        required.delete(name);
      }
      if (typeof config.label === "string") schema.title = config.label;
      properties[name] = schema;
      if (
        binding.valueType === "file" ||
        ["initImage", "initImages", "inputAudio"].includes(name)
      )
        files.push(fileInput(name, name === "initImages"));
    }
    inputSchema = {
      type: "object",
      properties,
      required: [...required],
      additionalProperties: false,
    };
  }
  const allowed = new Set(Object.keys(inputSchema.properties ?? {}));
  function parse(values: Record<string, unknown>) {
    const unknown = Object.keys(values).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new z.ZodError(
        unknown.map((key) => ({
          code: "custom",
          path: [key],
          message: "Unknown model input",
        })),
      );
    const params = { ...defaults, ...values };
    if (contract) {
      assertGradioExecutable(contract);
      const resolved = gradioInputValues(contract, { dynamicParams: params });
      const promptField = contract.inputs.find(
        (field) => field.canonical === "prompt",
      );
      const prompt = promptField ? resolved[promptField.name] : undefined;
      return runtime.parse({
        model: model.key,
        prompt: typeof prompt === "string" ? prompt : "",
        dynamicParams: resolved,
      });
    }
    for (const [name, value] of Object.entries(params)) {
      const reason = parameterValueIssue(
        name,
        object(object(model.parameters)[name]),
        value,
      );
      if (reason)
        throw new z.ZodError([
          {
            code: "custom",
            path: [name],
            message: "Invalid model input: " + reason,
          },
        ]);
    }
    const canonical: Record<string, unknown> = {},
      dynamic: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (
        Object.prototype.hasOwnProperty.call(runtime.shape, key) &&
        key !== "dynamicParams"
      )
        canonical[key] =
          stringAdapters.has(key) && value !== undefined
            ? String(value)
            : value;
      else dynamic[key] = value;
    }
    return runtime.parse({
      ...canonical,
      model: model.key,
      ...(Object.keys(dynamic).length ? { dynamicParams: dynamic } : {}),
    });
  }
  return { inputSchema, files, parse };
}
