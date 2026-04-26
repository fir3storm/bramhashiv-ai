import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CONFIG_DIR = join(homedir(), ".config", "bramhashiv");
export const CATALOG_PATH = join(CONFIG_DIR, "catalog.yaml");
export const STATE_PATH = join(CONFIG_DIR, "state.json");
export const TELEMETRY_PATH = join(CONFIG_DIR, "overrides.log");

export const DEFAULT_CATALOG_PATH = fileURLToPath(
  new URL("../config/default-catalog.yaml", import.meta.url),
);

export function ensureUserCatalog(): void {
  if (!existsSync(CATALOG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    copyFileSync(DEFAULT_CATALOG_PATH, CATALOG_PATH);
  }
}
