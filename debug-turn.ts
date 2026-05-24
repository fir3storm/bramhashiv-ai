import { createServerPlugin } from "./src/plugin-server.js";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = join(THIS_DIR, "config", "default-catalog.yaml");

const dir = mkdtempSync(join(tmpdir(), "bramhashiv-debug-"));
const catalogPath = join(dir, "catalog.yaml");
copyFileSync(DEFAULT_CATALOG, catalogPath);

const paths = { catalogPath, statePath: join(dir, "state.json"), telemetryPath: join(dir, "overrides.log") };

const trait_weights = { long_context: 0.4, deep_reasoning: 0.8, tool_use_accuracy: 0.8, speed_priority: 0.1, frontend_taste: 0.1, cost_efficiency: 0.2 };
const plan = JSON.stringify({ is_complex: true, reasoning: "split routing work into safe pieces", subtasks: [{ description: "Add regression coverage", estimated_tokens: 500, trait_weights }, { description: "Implement routing changes", estimated_tokens: 800, trait_weights }] });
const classifier = JSON.stringify(trait_weights);
const queue = [plan, classifier];
const runner = async () => {
  const next = queue.shift();
  if (next === undefined) throw new Error("no queued response");
  return next;
};

const factory = createServerPlugin({ ...paths, runner, ensureCatalog: () => {}, authedProviders: () => new Set(["anthropic", "google", "huggingface"]) });
const hooks = await factory({} as never);

const turn = {
  message: { id: "msg-1", sessionID: "sess-1", role: "user" as const, time: { created: Date.now() }, agent: "build", model: { providerID: "placeholder", modelID: "placeholder" } },
  parts: [{ id: "p-1", sessionID: "sess-1", messageID: "msg-1", type: "text" as const, text: "Implement a complete routing feature with tests and telemetry across the pipeline" }],
};

await hooks["chat.message"]!({} as never, turn as never);
console.log("turn.parts count:", turn.parts.length);
for (const p of turn.parts) {
  console.log(" part type=%s text=%s", p.type, String(p.text).slice(0, 120));
}
console.log("plan part found:", turn.parts.some((p: any) => p.type === "text" && String(p.text).includes("Plan: split routing work")));