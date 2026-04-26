import { describe, test, expect, beforeAll } from "bun:test";
import { createServerPlugin } from "../src/plugin-server.js";
import { readSharedState, writeSharedState } from "../src/shared-state.js";
import { mkdtempSync, copyFileSync } from "node:fs";
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
  });

  test("state-file pin beats classifier", async () => {
    const paths = makeTempPaths();
    await writeSharedState(paths.statePath, {
      pinned_model_id: "google/gemini-flash-latest",
      last_label: null,
      last_classifier: null,
      unavailable: [],
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
});
