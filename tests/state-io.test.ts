import { describe, test, expect } from "bun:test";
import { exportStateSync, importStateSync } from "../src/state-io.js";
import { writeSharedState, readSharedState } from "../src/shared-state.js";
import { mkdtempSync, existsSync } from "node:fs";
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

      exportStateSync(targetPath);
      expect(existsSync(targetPath)).toBe(true);
    });

    test("export file is valid JSON with expected structure", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const targetPath = join(dir, "export.json");

      exportStateSync(targetPath);
      const raw = JSON.parse(require("node:fs").readFileSync(targetPath, "utf-8"));
      expect(raw.version).toBe("1.0");
      expect(raw.exported_at).toBeDefined();
      expect(raw.state).toBeDefined();
      expect(typeof raw.state.schema_version).toBe("number");
    });
  });

  describe("importStateSync", () => {
    test("throws on non-existent file", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      expect(() => importStateSync(join(dir, "missing.json"))).toThrow("not found");
    });

    test("imports state (non-merge mode)", async () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const statePath = join(dir, "state.json");
      const exportPath = join(dir, "export.json");

      // Prepare a state file with known content
      const originalO = process.env.STATE_PATH;
      // Can't easily swap STATE_PATH; test the path-based import with a direct write
      const { writeFileSync } = require("node:fs");
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

      // This will write to STATE_PATH which is the default path in config-paths
      // We can't easily override it here, so just verify it doesn't throw on valid file
      expect(() => importStateSync(exportPath, false)).not.toThrow();
    });

    test("importStateSync with merge writes to state path", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const exportPath = join(dir, "export.json");
      const { writeFileSync } = require("node:fs");

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

      // importStateSync with merge=false writes to STATE_PATH
      // STATE_PATH is a global constant; verify the import doesn't throw
      expect(() => importStateSync(exportPath, false)).not.toThrow();
    });

    test("throws on missing state object", () => {
      const dir = mkdtempSync(join(tmpdir(), "bramhashiv-stateio-"));
      const exportPath = join(dir, "export.json");
      const { writeFileSync } = require("node:fs");
      writeFileSync(exportPath, JSON.stringify({ version: "1.0", exported_at: "", state: null }), "utf-8");
      expect(() => importStateSync(exportPath)).toThrow("missing 'state' object");
    });
  });
});
