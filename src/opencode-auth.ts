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

/**
 * Returns the set of provider IDs that have credentials in OpenCode's auth.
 * "api" entries require a non-empty key; "oauth" entries are accepted by presence
 * (the refresh/access tokens themselves live inside the entry but we don't validate
 * their freshness here — OpenCode handles that at dispatch time).
 */
export function getAuthedProviders(path?: string): Set<string> {
  const auth = readOpenCodeAuth(path);
  const out = new Set<string>();
  for (const [provider, entry] of Object.entries(auth)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "api") {
      if (typeof entry.key === "string" && entry.key.length > 0) out.add(provider);
    } else if (entry.type === "oauth") {
      out.add(provider);
    } else {
      // Unknown auth type — be conservative and assume authed so the user
      // doesn't get silently locked out by an OpenCode auth schema change.
      out.add(provider);
    }
  }
  return out;
}
