import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import chokidar from "chokidar";
import { TRAIT_NAMES, type Catalog, type ModelEntry, type TraitName } from "./types.js";

const ALLOWED_PROVIDERS = ["anthropic", "google", "huggingface", "openrouter", "openai"] as const;

export type ProviderModelList = readonly string[] | ReadonlySet<string>;

export type CatalogModelIdIssue =
  | {
      type: "unknown_provider";
      provider: ModelEntry["provider"];
      modelId: string;
    }
  | {
      type: "unknown_model";
      provider: ModelEntry["provider"];
      modelId: string;
    }
  | {
      type: "duplicate_model_id";
      modelId: string;
      firstIndex: number;
      duplicateIndex: number;
    };

function providerModelListHas(models: ProviderModelList, modelId: string): boolean {
  return "has" in models ? models.has(modelId) : models.includes(modelId);
}

export function validateCatalog(cat: unknown): asserts cat is Catalog {
  if (!cat || typeof cat !== "object" || !("models" in cat)) {
    throw new Error("catalog must have a 'models' key");
  }
  const models = (cat as { models: unknown }).models;
  if (!Array.isArray(models)) throw new Error("'models' must be a list");
  for (const m of models) {
    if (!m || typeof m !== "object") throw new Error("model entry must be object");
    const entry = m as Record<string, unknown>;
    if (typeof entry.id !== "string") throw new Error("model.id must be string");
    if (!ALLOWED_PROVIDERS.includes(entry.provider as typeof ALLOWED_PROVIDERS[number])) {
      throw new Error(`invalid provider '${entry.provider}' for ${entry.id}`);
    }
    if (!entry.scores || typeof entry.scores !== "object") {
      throw new Error(`model ${entry.id}: 'scores' required`);
    }
    const scores = entry.scores as Record<string, unknown>;
    for (const trait of TRAIT_NAMES) {
      if (typeof scores[trait] !== "number") {
        throw new Error(`model ${entry.id}: missing trait '${trait}'`);
      }
      const v = scores[trait] as number;
      if (v < 0 || v > 10) {
        throw new Error(`model ${entry.id}: trait '${trait}' must be 0..10 (got ${v})`);
      }
    }
  }
}

export function validateCatalogModelIds(
  cat: Catalog,
  availableModelsByProvider: Partial<Record<ModelEntry["provider"], ProviderModelList>>,
): CatalogModelIdIssue[] {
  const issues: CatalogModelIdIssue[] = [];
  const firstSeenById = new Map<string, number>();

  cat.models.forEach((model, index) => {
    const firstIndex = firstSeenById.get(model.id);
    if (firstIndex === undefined) {
      firstSeenById.set(model.id, index);
    } else {
      issues.push({
        type: "duplicate_model_id",
        modelId: model.id,
        firstIndex,
        duplicateIndex: index,
      });
    }

    const availableModels = availableModelsByProvider[model.provider];
    if (!availableModels) {
      issues.push({
        type: "unknown_provider",
        provider: model.provider,
        modelId: model.id,
      });
      return;
    }

    if (!providerModelListHas(availableModels, model.id)) {
      issues.push({
        type: "unknown_model",
        provider: model.provider,
        modelId: model.id,
      });
    }
  });

  return issues;
}

export function parseCatalog(yamlText: string): Catalog {
  const raw = parseYaml(yamlText);
  validateCatalog(raw);
  return raw;
}

export function loadCatalog(path: string): Catalog {
  return parseCatalog(readFileSync(path, "utf8"));
}

export interface CatalogWatcher {
  current(): Catalog;
  stop(): void;
}

export function watchCatalog(path: string, onChange?: (c: Catalog) => void): CatalogWatcher {
  let current = loadCatalog(path);
  const watcher = chokidar.watch(path, { ignoreInitial: true });
  watcher.on("change", () => {
    try {
      const next = loadCatalog(path);
      current = next;
      onChange?.(next);
    } catch (err) {
      console.error(`[bramhashiv] catalog reload failed, keeping previous:`, err);
    }
  });
  return {
    current: () => current,
    stop: () => void watcher.close(),
  };
}
