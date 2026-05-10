import { describe, test, expect, beforeAll } from "bun:test";
import { createServerPlugin } from "../src/plugin-server.js";
import { readSharedState, writeSharedState } from "../src/shared-state.js";
import { mkdtempSync, copyFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompletionRunner } from "../src/classifier.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = join(THIS_DIR, "..", "config", "default-catalog.yaml");

beforeAll(() => {
  delete process.env.BRAMHASHIV_PIN;
});

function makeTempPaths() {
  const dir = mkdtempSync(join(tmpdir(), "bramhashiv-e2e-"));
  const catalogPath = join(dir, "catalog.yaml");
  copyFileSync(DEFAULT_CATALOG, catalogPath);
  return {
    catalogPath,
    statePath: join(dir, "state.json"),
    telemetryPath: join(dir, "overrides.log"),
  };
}

function mockRunner(weights: Record<string, number>): CompletionRunner {
  return async () => JSON.stringify(weights);
}

function queuedRunner(responses: string[]): CompletionRunner {
  const queue = [...responses];
  return async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("no queued response");
    return next;
  };
}

function fakeUserTurn(text: string) {
  return {
    message: {
      id: "msg-1",
      sessionID: "sess-1",
      role: "user" as const,
      time: { created: Date.now() },
      agent: "build",
      model: { providerID: "placeholder", modelID: "placeholder" },
    },
    parts: [
      {
        id: "p-1",
        sessionID: "sess-1",
        messageID: "msg-1",
        type: "text" as const,
        text,
      },
    ],
  };
}

async function activate(
  paths: ReturnType<typeof makeTempPaths>,
  runner: CompletionRunner | null,
  authed: Set<string> = new Set(["anthropic", "google", "huggingface"]),
) {
  const factory = createServerPlugin({
    ...paths,
    runner,
    ensureCatalog: () => {},
    authedProviders: () => authed,
  });
  return factory({} as never);
}

describe("plugin server end-to-end harness", () => {
  test("routes long-context task to a strong model + persists label", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.95,
        deep_reasoning: 0.9,
        tool_use_accuracy: 0.5,
        speed_priority: 0.1,
        frontend_taste: 0.1,
        cost_efficiency: 0.05,
      }),
    );
    const turn = fakeUserTurn("Audit this 40-file module for rate limiter bugs");
    await hooks["chat.message"]!({} as never, turn as never);

    expect(turn.message.model.providerID).not.toBe("placeholder");
    expect(
      ["anthropic", "google", "huggingface"].includes(turn.message.model.providerID),
    ).toBe(true);

    const state = await readSharedState(paths.statePath);
    expect(state.last_label).toMatch(/long_context|deep_reasoning/);
    expect(state.last_classifier?.fallback).toBe(false);
    expect(state.last_route_debug?.decision.picked.id).toBe(
      `${turn.message.model.providerID}/${turn.message.model.modelID}`,
    );
    expect(state.last_route_debug?.unavailable).toEqual(
      expect.arrayContaining(["openai/gpt-5.5"]),
    );
  });

  test("state-file pin beats classifier", async () => {
    const paths = makeTempPaths();
    await writeSharedState(paths.statePath, {
      pinned_model_id: "google/gemini-flash-latest",
      last_label: null,
      last_classifier: null,
      unavailable: [],
      learned_adjustments: [],
      task_history: [],
      regeneration_records: [],
      provider_health: [],
    });
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.95,
        deep_reasoning: 0.95,
        tool_use_accuracy: 0.5,
        speed_priority: 0.1,
        frontend_taste: 0.1,
        cost_efficiency: 0.1,
      }),
    );
    const turn = fakeUserTurn("Design a distributed lock manager");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model).toEqual({
      providerID: "google",
      modelID: "gemini-flash-latest",
    });
  });

  test("state-file pin logs what auto-routing would have picked", async () => {
    const paths = makeTempPaths();
    await writeSharedState(paths.statePath, {
      pinned_model_id: "google/gemini-flash-latest",
      last_label: null,
      last_classifier: null,
      unavailable: [],
      learned_adjustments: [],
      task_history: [],
      regeneration_records: [],
      provider_health: [],
    });
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.95,
        deep_reasoning: 0.95,
        tool_use_accuracy: 0.5,
        speed_priority: 0.1,
        frontend_taste: 0.1,
        cost_efficiency: 0.1,
      }),
    );

    const turn = fakeUserTurn("Design a distributed lock manager");
    await hooks["chat.message"]!({} as never, turn as never);

    const telemetry = await readFile(paths.telemetryPath, "utf8");
    const event = JSON.parse(telemetry.trim());
    expect(event.user_picked).toBe("google/gemini-flash-latest");
    expect(event.routed_to).not.toBe("google/gemini-flash-latest");
  });

  test("planner output is appended to complex user turns", async () => {
    const paths = makeTempPaths();
    const trait_weights = {
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.8,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    };
    const plan = JSON.stringify({
      is_complex: true,
      reasoning: "split routing work into safe pieces",
      subtasks: [
        { description: "Add regression coverage", estimated_tokens: 500, trait_weights },
        { description: "Implement routing changes", estimated_tokens: 800, trait_weights },
      ],
    });
    const classifier = JSON.stringify(trait_weights);
    const hooks = await activate(paths, queuedRunner([plan, classifier]));

    const turn = fakeUserTurn("Implement a complete routing feature with tests and telemetry across the pipeline");
    await hooks["chat.message"]!({} as never, turn as never);

    expect(turn.parts.some((p) => p.type === "text" && p.text.includes("Plan: split routing work"))).toBe(true);
    expect(turn.parts.some((p) => p.type === "text" && p.text.includes("Add regression coverage"))).toBe(true);
  });

  test("falls back gracefully when classifier returns garbage", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(paths, async () => "not even close to json");
    const turn = fakeUserTurn("any task at all");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model.providerID).not.toBe("placeholder");

    const state = await readSharedState(paths.statePath);
    expect(state.last_classifier?.fallback).toBe(true);
  });

  test("runs pipeline with no runner (neutral weights)", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(paths, null);
    const turn = fakeUserTurn("anything");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model.providerID).not.toBe("placeholder");
  });

  test("skips unauthed providers — Anthropic-heavy classifier still routes to authed model", async () => {
    const paths = makeTempPaths();
    // Classifier weights that would normally rank Opus/Sonnet at top.
    const opusFavoring = mockRunner({
      long_context: 0.95,
      deep_reasoning: 0.95,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.6,
      cost_efficiency: 0.05,
    });
    const hooks = await activate(paths, opusFavoring, new Set(["google", "huggingface"]));
    const turn = fakeUserTurn("Audit this 40-file payments service for race conditions");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model.providerID).not.toBe("anthropic");
    expect(turn.message.model.providerID).not.toBe("placeholder");
  });

  test("when only google is authed, every routed model is google", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.5,
        deep_reasoning: 0.5,
        tool_use_accuracy: 0.5,
        speed_priority: 0.5,
        frontend_taste: 0.5,
        cost_efficiency: 0.5,
      }),
      new Set(["google"]),
    );
    const turn = fakeUserTurn("anything goes here");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model.providerID).toBe("google");
  });

  test("empty text + no pin → no-op (model unchanged)", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.5,
        deep_reasoning: 0.5,
        tool_use_accuracy: 0.5,
        speed_priority: 0.5,
        frontend_taste: 0.5,
        cost_efficiency: 0.5,
      }),
    );
    const turn = fakeUserTurn("");
    await hooks["chat.message"]!({} as never, turn as never);
    expect(turn.message.model).toEqual({
      providerID: "placeholder",
      modelID: "placeholder",
    });
  });

  test("session errors record failed learning outcomes", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.4,
        deep_reasoning: 0.8,
        tool_use_accuracy: 0.9,
        speed_priority: 0.1,
        frontend_taste: 0.1,
        cost_efficiency: 0.2,
      }),
    );
    const turn = fakeUserTurn("Refactor the router safely");
    await hooks["chat.message"]!({} as never, turn as never);

    await hooks.event!({
      event: {
        type: "session.error",
        properties: {
          error: {
            name: "APIError",
            data: { statusCode: 429 },
          },
        },
      },
    } as never);

    const state = await readSharedState(paths.statePath);
    expect(state.task_history[0]?.success).toBe(false);
    expect(state.learned_adjustments.some((a) => a.delta < 0)).toBe(true);
  });

  test("completed messages persist diff size from OpenCode session.diff", async () => {
    const paths = makeTempPaths();
    const hooks = await activate(
      paths,
      mockRunner({
        long_context: 0.4,
        deep_reasoning: 0.8,
        tool_use_accuracy: 0.9,
        speed_priority: 0.1,
        frontend_taste: 0.1,
        cost_efficiency: 0.2,
      }),
    );
    const turn = fakeUserTurn("Refactor the router safely");
    await hooks["chat.message"]!({} as never, turn as never);

    await hooks.event!({
      event: {
        type: "session.diff",
        properties: {
          sessionID: "sess-1",
          diff: [
            { file: "src/router.ts", additions: 120, deletions: 80 },
            { file: "src/types.ts", additions: 121, deletions: 0 },
          ],
        },
      },
    } as never);

    await hooks.event!({
      event: {
        type: "message.updated",
        properties: {
          sessionID: "sess-1",
          info: {
            id: "assistant-1",
            sessionID: "sess-1",
            role: "assistant",
            time: { created: Date.now() - 1000, completed: Date.now() },
          },
        },
      },
    } as never);

    const state = await readSharedState(paths.statePath);
    expect(state.task_history[0]?.success).toBe(true);
    expect(state.task_history[0]?.diff_size).toBe(321);
  });
});
