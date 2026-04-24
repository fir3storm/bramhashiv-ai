import { describe, test, expect } from "bun:test";
import { getGoogleApiKey, readOpenCodeAuth } from "../src/opencode-auth.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tempAuth(contents: object): string {
  const dir = mkdtempSync(join(tmpdir(), "bramhashiv-auth-"));
  const path = join(dir, "auth.json");
  writeFileSync(path, JSON.stringify(contents), "utf8");
  return path;
}

describe("opencode-auth", () => {
  test("getGoogleApiKey returns key when google is api type", () => {
    const path = tempAuth({
      google: { type: "api", key: "AIza-test-key" },
    });
    expect(getGoogleApiKey(path)).toBe("AIza-test-key");
  });

  test("getGoogleApiKey returns null when google is oauth type", () => {
    const path = tempAuth({
      google: { type: "oauth", refresh: "rt_xxx", access: "acc_xxx" },
    });
    expect(getGoogleApiKey(path)).toBeNull();
  });

  test("getGoogleApiKey returns null when google entry missing", () => {
    const path = tempAuth({
      openai: { type: "oauth" },
      huggingface: { type: "api", key: "hf_xxx" },
    });
    expect(getGoogleApiKey(path)).toBeNull();
  });

  test("getGoogleApiKey returns null when key is empty string", () => {
    const path = tempAuth({ google: { type: "api", key: "" } });
    expect(getGoogleApiKey(path)).toBeNull();
  });

  test("readOpenCodeAuth returns {} when file missing", () => {
    expect(readOpenCodeAuth("/nonexistent/path/auth.json")).toEqual({});
  });

  test("readOpenCodeAuth returns {} on malformed JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-auth-"));
    const path = join(dir, "auth.json");
    writeFileSync(path, "not json at all", "utf8");
    expect(readOpenCodeAuth(path)).toEqual({});
  });
});
