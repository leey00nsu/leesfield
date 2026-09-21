import { modelCatalogSchema, type ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { listModelCatalogRecords } from "@/server/model-catalog/catalog-repository";

const DEFAULT_CACHE_TTL_MS = 60_000;

type CacheEntry = {
  fetchedAt: number;
  items: ModelCatalogItem[];
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, {
  generation: number;
  promise: Promise<ModelCatalogItem[]>;
}>();
let cacheGeneration = 0;

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

    const pending = inFlight.get(key);
    if (pending?.generation === cacheGeneration) return pending.promise;
  }

  const generation = cacheGeneration;
  const promise = loadCatalog(includeInactive)
    .then((items) => {
      // An administrator may invalidate while this request is loading. Do not
      // let that stale result repopulate the cache after the invalidation.
      if (generation === cacheGeneration) {
        cache.set(key, { fetchedAt: Date.now(), items });
      }
      return items;
    })
    .finally(() => {
      const pending = inFlight.get(key);
      if (pending?.promise === promise) inFlight.delete(key);
    });

  inFlight.set(key, { generation, promise });
  return promise;
}

export function invalidateModelCatalogCache() {
  cacheGeneration += 1;
  cache.clear();
  inFlight.clear();
}
