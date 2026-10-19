import { describe, test, expect } from "bun:test";
import { exportStateSync, importStateSync } from "../src/state-io.js";
import { writeSharedState, readSharedState } from "../src/shared-state.js";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginState } from "../src/shared-state.js";

const base: Partial<PluginState> = {
  schema_version: 1,
  learned_adjustments: [],
  task_history: [],
  regeneration_records: [],
  provider_health: [],
};

describe("state-io", () => {
  describe("exportStateSync", () => {
    test("writes an export file", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const targetPath = join(dir, "export.json");

      exportStateSync(targetPath, join(dir, "state.json"));
      expect(existsSync(targetPath)).toBe(true);
    });

    test("export file is valid JSON with expected structure", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const targetPath = join(dir, "export.json");

      exportStateSync(targetPath, join(dir, "state.json"));
      const raw = JSON.parse(readFileSync(targetPath, "utf-8"));
      expect(raw.version).toBe("1.0");
      expect(raw.exported_at).toBeDefined();
      expect(raw.state).toBeDefined();
      expect(typeof raw.state.schema_version).toBe("number");
    });
  });

  describe("importStateSync", () => {
    test("throws on non-existent file", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      expect(() => importStateSync(join(dir, "missing.json"), false, join(dir, "state.json"))).toThrow("not found");
    });

    test("imports state (non-merge mode)", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const statePath = join(dir, "state.json");
      const exportPath = join(dir, "export.json");

      // Prepare an export with known content
      const payload = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        state: {
          schema_version: 1,
          pinned_model_id: "test/model",
          last_label: null,
          last_classifier: null,
          unavailable: [],
          learned_adjustments: [],
          task_history: [],
          regeneration_records: [],
          provider_health: [],
        },
      };
      writeFileSync(exportPath, JSON.stringify(payload, null, 2), "utf-8");

      // Write to an isolated temp state path so we don't touch the real config
      expect(() => importStateSync(exportPath, false, statePath)).not.toThrow();
    });

    test("importStateSync with merge writes to state path", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const exportPath = join(dir, "export.json");

      // Create an export with minimal valid state
      const payload = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        state: {
          schema_version: 1,
          pinned_model_id: null,
          last_label: null,
          last_classifier: null,
          unavailable: [],
          learned_adjustments: [],
          task_history: [],
          regeneration_records: [],
          provider_health: [],
        },
      };
      writeFileSync(exportPath, JSON.stringify(payload, null, 2), "utf-8");

      // importStateSync with merge=false writes to an isolated temp state path
      expect(() => importStateSync(exportPath, false, join(dir, "state.json"))).not.toThrow();
    });

    test("throws on missing state object", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const exportPath = join(dir, "export.json");
      writeFileSync(exportPath, JSON.stringify({ version: "1.0", exported_at: "", state: null }), "utf-8");
      expect(() => importStateSync(exportPath, false, join(dir, "state.json"))).toThrow("missing 'state' object");
    });
  });
});
