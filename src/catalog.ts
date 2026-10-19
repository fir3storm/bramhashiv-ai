import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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
  const c = cat as Record<string, unknown>;
  if (c.custom_traits !== undefined) {
    if (!Array.isArray(c.custom_traits)) throw new Error("'custom_traits' must be a list");
    for (const ct of c.custom_traits) {
      if (!ct || typeof ct !== "object") throw new Error("custom_trait entry must be object");
      const entry = ct as Record<string, unknown>;
      if (typeof entry.name !== "string") throw new Error("custom_trait.name must be string");
      if (typeof entry.description !== "string") throw new Error("custom_trait.description must be string");
    }
  }
  const models = c.models;
  if (!Array.isArray(models)) throw new Error("'models' must be a list");
  for (const m of models) {
    if (!m || typeof m !== "object") throw new Error("model entry must be object");
    const entry = m as Record<string, unknown>;
    if (typeof entry.id !== "string") throw new Error("model.id must be string");
    if (typeof entry.provider !== "string") {
      throw new Error(`model ${entry.id}: provider must be a string`);
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

function findProjectCatalog(startDir: string): string | null {
  const maxDepth = 5;
  let dir = startDir;
  for (let i = 0; i < maxDepth; i++) {
    const candidate = join(dir, ".bramhashiv", "catalog.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function mergeCatalogs(base: Catalog, override: Catalog): Catalog {
  const byId = new Map(base.models.map((m) => [m.id, m]));
  for (const m of override.models) {
    byId.set(m.id, m);
  }
  return { models: [...byId.values()] };
}

export interface CatalogWatcher {
  current(): Catalog;
  stop(): void;
}

export function watchCatalog(path: string, onChange?: (c: Catalog) => void): CatalogWatcher {
  let current = loadCatalog(path);

  // Load project-level override if present
  const projectPath = findProjectCatalog(process.cwd());
  if (projectPath) {
    try {
      const override = loadCatalog(projectPath);
      current = mergeCatalogs(current, override);
    } catch (err) {
      console.error(`[bramhashiv] project catalog override failed:`, err);
    }
  }

  const watcher = chokidar.watch(path, { ignoreInitial: true });
  watcher.on("change", () => {
    try {
      let next = loadCatalog(path);
      if (projectPath) {
        try {
          const override = loadCatalog(projectPath);
          next = mergeCatalogs(next, override);
        } catch {
          // keep base if project override fails
        }
      }
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
