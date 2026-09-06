import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/server/db/prisma";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import {
  emptySpacePreferences, spacePreferencesSchema, updateSpacePreferencesSchema, validSpaceDefaultParameters,
  type SpaceDefaults, type SpacePreferences,
} from "@/shared/generation-graph/space-preferences";

export class SpacePreferenceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}


function currentDefaults(defaults: SpaceDefaults, catalog: ModelCatalogItem[], reject: boolean): SpaceDefaults {
  return Object.fromEntries(Object.entries(defaults).flatMap(([media, entry]) => {
    const model = catalog.find((item) => item.key === entry.modelKey && item.type === media && item.isActive);
    if (model && validSpaceDefaultParameters(model.parameters, entry.parameters)) return [[media, entry]];
    if (reject) throw new SpacePreferenceError("SPACE_DEFAULTS_INVALID", 400);
    return []; // A removed model/schema never leaks stale values into a new node.
  }));
}

function readRecord(record: unknown): SpacePreferences {
  if (!record) return emptySpacePreferences();
  const { schemaVersion, revision, recentModelKeys, defaults, inlineParametersEnabled } = record as SpacePreferences;
  const result = spacePreferencesSchema.safeParse({ schemaVersion, revision, recentModelKeys, defaults, ...(inlineParametersEnabled !== undefined ? { inlineParametersEnabled } : {}) });
  if (!result.success) throw new SpacePreferenceError("SPACE_PREFERENCES_UNSUPPORTED", 409);
  return result.data;
}

export function createSpacePreferencesRepository(
  database: Pick<PrismaClient, "spaceEditorPreference" | "$transaction"> = prisma,
  loadCatalog: typeof getModelCatalog = getModelCatalog,
) {
  return {
    async get(ownerEmail: string): Promise<SpacePreferences> {
      const [record, catalog] = await Promise.all([
        database.spaceEditorPreference.findUnique({ where: { ownerEmail } }), loadCatalog(),
      ]);
      const stored = readRecord(record);
      const active = new Set(catalog.filter((item) => item.isActive).map((item) => item.key));
      return { ...stored, recentModelKeys: stored.recentModelKeys.filter((key) => active.has(key)), defaults: currentDefaults(stored.defaults, catalog, false) };
    },
    async update(ownerEmail: string, body: unknown): Promise<SpacePreferences> {
      const input = updateSpacePreferencesSchema.parse(body);
      const catalog = await loadCatalog();
      if (input.action === "track" && !catalog.some((model) => model.key === input.modelKey && model.isActive)) {
        throw new SpacePreferenceError("SPACE_MODEL_UNAVAILABLE", 400);
      }
      const defaults = input.action === "defaults" || input.action === "settings" && input.defaults !== undefined
        ? currentDefaults(input.defaults!, catalog, true) : null;
      return database.$transaction(async (transaction) => {
        const record = await transaction.spaceEditorPreference.upsert({
          where: { ownerEmail }, create: { ownerEmail }, update: {},
        });
        const stored = readRecord(record);
        if (stored.revision !== input.expectedRevision) throw new SpacePreferenceError("SPACE_PREFERENCES_CONFLICT", 409);
        const next: SpacePreferences = {
          ...stored, revision: stored.revision + 1,
          recentModelKeys: input.action === "track"
            ? [input.modelKey, ...stored.recentModelKeys.filter((key) => key !== input.modelKey)].slice(0, 20) : stored.recentModelKeys,
          defaults: defaults ?? stored.defaults,
          ...(input.action === "inline" ? { inlineParametersEnabled: input.enabled } : {}),
          ...(input.action === "settings" && input.inlineParametersEnabled !== undefined ? { inlineParametersEnabled: input.inlineParametersEnabled } : {}),
        };
        const updated = await transaction.spaceEditorPreference.updateMany({
          where: { ownerEmail, revision: stored.revision, schemaVersion: 1 },
          data: { revision: next.revision, recentModelKeys: next.recentModelKeys, defaults: next.defaults, inlineParametersEnabled: next.inlineParametersEnabled ?? false },
        });
        if (updated.count !== 1) throw new SpacePreferenceError("SPACE_PREFERENCES_CONFLICT", 409);
        const active = new Set(catalog.filter((model) => model.isActive).map((model) => model.key));
        return { ...next, recentModelKeys: next.recentModelKeys.filter((key) => active.has(key)), defaults: currentDefaults(next.defaults, catalog, false) };
      });
    },
  };
}

export const spacePreferencesRepository = createSpacePreferencesRepository();
