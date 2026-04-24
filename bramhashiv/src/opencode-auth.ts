import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface AuthEntry {
  type: string;
  key?: string;
}

interface AuthFile {
  [provider: string]: AuthEntry;
}

export function getDefaultAuthPath(): string {
  // OpenCode writes auth to ~/.local/share/opencode/auth.json on all
  // platforms (including Windows — verified via `opencode debug paths`).
  return join(homedir(), ".local", "share", "opencode", "auth.json");
}

export function readOpenCodeAuth(path: string = getDefaultAuthPath()): AuthFile {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return raw && typeof raw === "object" ? (raw as AuthFile) : {};
  } catch {
    return {};
  }
}

/**
 * Reads the Google API key from OpenCode's auth file.
 * Returns null unless the google entry is type "api" with a non-empty key.
 */
export function getGoogleApiKey(path?: string): string | null {
  const auth = readOpenCodeAuth(path);
  const entry = auth.google;
  if (!entry || entry.type !== "api") return null;
  return typeof entry.key === "string" && entry.key.length > 0 ? entry.key : null;
}
