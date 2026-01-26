import { modelCatalogSchema, type ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { listModelCatalogRecords } from "@/server/model-catalog/catalog-repository";

const DEFAULT_CACHE_TTL_MS = 60_000;

type CacheEntry = {
  fetchedAt: number;
  items: ModelCatalogItem[];
};

const cache = new Map<string, CacheEntry>();

function cacheKey(includeInactive: boolean) {
  return includeInactive ? "all" : "active";
}

async function loadCatalog(includeInactive: boolean) {
  const records = await listModelCatalogRecords({ includeInactive });
  const parsed = modelCatalogSchema.safeParse(records);
  if (!parsed.success) {
    throw new Error("MODEL_CATALOG_INVALID");
  }
  return parsed.data;
}

export async function getModelCatalog(params: {
  includeInactive?: boolean;
  bypassCache?: boolean;
  ttlMs?: number;
} = {}) {
  const includeInactive = params.includeInactive ?? false;
  const ttlMs = params.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const key = cacheKey(includeInactive);

  if (!params.bypassCache) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return cached.items;
    }
  }

  const items = await loadCatalog(includeInactive);
  cache.set(key, { fetchedAt: Date.now(), items });
  return items;
}

export function invalidateModelCatalogCache() {
  cache.clear();
}
