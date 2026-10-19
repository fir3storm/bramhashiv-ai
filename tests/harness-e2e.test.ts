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

type RoutedModel = { providerID: string; id: string } | null;

interface Harness {
  drive(
    text: string,
    opts?: { sessionID?: string; messageID?: string },
  ): Promise<{ promptText: string; model: RoutedModel; notes: string[] }>;
  emitEvent(type: string, data: unknown): Promise<void>;
  retry(event: {
    sessionID: string;
    model: { providerID: string; id: string };
    error: { type: string; message: string; status?: number };
    attempt: number;
    decision: { retry: boolean; delay?: number };
  }): Promise<void>;
  httpResponse(event: {
    kind: string;
    sessionID: string;
    model: { providerID: string; id: string };
    response: Response;
  }): Promise<void>;
  switchCount: number;
}

async function activate(
  paths: ReturnType<typeof makeTempPaths>,
  runner: CompletionRunner | null,
  authed: Set<string> = new Set(["anthropic", "google", "huggingface"]),
): Promise<Harness> {
  const plugin = createServerPlugin({
    ...paths,
    runner,
    ensureCatalog: () => {},
    authedProviders: () => authed,
  });

  const hooks = new Map<string, (event: never) => unknown>();
  let lastModel: RoutedModel = null;
  let switchCount = 0;
  let promptSeq = 0;
  const notes: string[] = [];

  type QueuedEvent = { type: string; data: unknown; done: () => void };
  const queue: QueuedEvent[] = [];
  const waiters: Array<(item: QueuedEvent) => void> = [];

  const ctx = {
    session: {
      hook: async (name: string, cb: (event: never) => unknown) => {
        hooks.set(name, cb);
      },
      switchModel: async (input: { sessionID: string; model: { providerID: string; id: string } }) => {
        lastModel = input.model;
        switchCount += 1;
      },
      synthetic: async (input: { text: string }) => {
        notes.push(input.text);
      },
    },
    event: {
      subscribe: async function* () {
        while (true) {
          const queued = queue.shift();
          const item = queued ?? (await new Promise<QueuedEvent>((resolve) => {
            waiters.push(resolve);
          }));
          yield { type: item.type, data: item.data };
          item.done();
        }
      },
    },
  };

  await plugin.setup(ctx as never);

  const promptCb = hooks.get("prompt");
  if (!promptCb) throw new Error("prompt hook was not registered");

  return {
    get switchCount() {
      return switchCount;
    },
    async drive(text: string, opts?: { sessionID?: string; messageID?: string }) {
      const before = notes.length;
      const event = {
        sessionID: opts?.sessionID ?? "sess-1",
        messageID: opts?.messageID ?? `msg-${++promptSeq}`,
        prompt: { text },
      };
      lastModel = null;
      await promptCb(event as never);
      return { promptText: event.prompt.text, model: lastModel, notes: notes.slice(before) };
    },
    async emitEvent(type: string, data: unknown) {
      await new Promise<void>((resolve) => {
        const item = { type, data, done: resolve };
        const waiter = waiters.shift();
        if (waiter) waiter(item);
        else queue.push(item);
      });
    },
    async retry(event) {
      const cb = hooks.get("retry");
      if (!cb) throw new Error("retry hook was not registered");
      await cb(event as never);
    },
    async httpResponse(event) {
      const cb = hooks.get("http.response");
      if (!cb) throw new Error("http.response hook was not registered");
      await cb(event as never);
    },
  };
}

describe("plugin server end-to-end harness", () => {
  test("routes long-context task to a strong model + persists label", async () => {
    const paths = makeTempPaths();
    const harness = await activate(
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
    const { model } = await harness.drive("Audit this 40-file module for rate limiter bugs");

    expect(model?.providerID).not.toBe("placeholder");
    expect(
      ["anthropic", "google", "huggingface"].includes(model?.providerID ?? ""),
    ).toBe(true);

    const state = await readSharedState(paths.statePath);
    expect(state.last_label).toMatch(/long_context|deep_reasoning/);
    expect(state.last_classifier?.fallback).toBe(false);
    expect(state.last_route_debug?.decision.picked.id).toBe(
      `${model?.providerID}/${model?.id}`,
    );
    expect(state.last_route_debug?.unavailable).toEqual(
      expect.arrayContaining(["openai/gpt-5.5"]),
    );
  });

  test("state-file pin beats classifier", async () => {
    const paths = makeTempPaths();
    await writeSharedState(paths.statePath, {
      schema_version: 1,
      pinned_model_id: "google/gemini-flash-latest",
      last_label: null,
      last_classifier: null,
      unavailable: [],
      learned_adjustments: [],
      task_history: [],
      regeneration_records: [],
      provider_health: [],
    });
    const harness = await activate(
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
    const { model } = await harness.drive("Design a distributed lock manager");
    expect(model).toEqual({
      providerID: "google",
      id: "gemini-flash-latest",
    });
  });

  test("state-file pin logs what auto-routing would have picked", async () => {
    const paths = makeTempPaths();
    await writeSharedState(paths.statePath, {
      schema_version: 1,
      pinned_model_id: "google/gemini-flash-latest",
      last_label: null,
      last_classifier: null,
      unavailable: [],
      learned_adjustments: [],
      task_history: [],
      regeneration_records: [],
      provider_health: [],
    });
    const harness = await activate(
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

    await harness.drive("Design a distributed lock manager");

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
    const harness = await activate(paths, queuedRunner([plan, classifier]));

    const { promptText } = await harness.drive("Implement a complete routing feature with tests and telemetry across the pipeline");

    expect(promptText.includes("Plan: split routing work")).toBe(true);
    expect(promptText.includes("Add regression coverage")).toBe(true);
  });

  test("falls back gracefully when classifier returns garbage", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, async () => "not even close to json");
    const { model } = await harness.drive("any task at all");
    expect(model?.providerID).not.toBe("placeholder");

    const state = await readSharedState(paths.statePath);
    expect(state.last_classifier?.fallback).toBe(true);
  });

  test("runs pipeline with no runner (neutral weights)", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, null);
    const { model } = await harness.drive("anything");
    expect(model?.providerID).not.toBe("placeholder");
  });

  test("skips unauthed providers — Anthropic-heavy classifier still routes to authed model", async () => {
    const paths = makeTempPaths();
    const opusFavoring = mockRunner({
      long_context: 0.95,
      deep_reasoning: 0.95,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.6,
      cost_efficiency: 0.05,
    });
    const harness = await activate(paths, opusFavoring, new Set(["google", "huggingface"]));
    const { model } = await harness.drive("Audit this 40-file payments service for race conditions");
    expect(model?.providerID).not.toBe("anthropic");
    expect(model?.providerID).not.toBe("placeholder");
  });

  test("when only google is authed, every routed model is google", async () => {
    const paths = makeTempPaths();
    const harness = await activate(
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
    const { model } = await harness.drive("anything goes here");
    expect(model?.providerID).toBe("google");
  });

  test("empty text + no pin → no-op (model unchanged)", async () => {
    const paths = makeTempPaths();
    const harness = await activate(
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
    const { model } = await harness.drive("");
    expect(model).toBeNull();
  });

  test("session errors record failed learning outcomes", async () => {
    const paths = makeTempPaths();
    const harness = await activate(
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
    await harness.drive("Refactor the router safely");

    await harness.emitEvent("session.execution.failed", {
      sessionID: "sess-1",
      error: {
        type: "api_error",
        message: "rate limited",
        status: 429,
      },
    });

    const state = await readSharedState(paths.statePath);
    expect(state.task_history[0]?.success).toBe(false);
    expect(state.learned_adjustments.some((a) => a.delta < 0)).toBe(true);
  });

  test("completed executions persist success outcome", async () => {
    const paths = makeTempPaths();
    const harness = await activate(
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
    await harness.drive("Refactor the router safely");

    await harness.emitEvent("session.execution.succeeded", {
      sessionID: "sess-1",
    });

    const state = await readSharedState(paths.statePath);
    expect(state.task_history[0]?.success).toBe(true);
  });

  test("retryable provider.invalid-request 429 marks the routed model", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    const { model } = await harness.drive("Refactor the router safely");
    const modelId = `${model?.providerID}/${model?.id}`;

    await harness.emitEvent("session.step.failed", {
      sessionID: "sess-1",
      assistantMessageID: "asst-1",
      error: { type: "provider.invalid-request", message: "slow down", status: 429 },
    });

    const state = await readSharedState(paths.statePath);
    expect(state.unavailable.map((mark) => mark.id)).toContain(modelId);
    expect(state.task_history).toEqual([]);
  });

  test("retry hook marks provider.rate-limit before the turn is terminal", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    const { model } = await harness.drive("Refactor the router safely");
    await harness.retry({
      sessionID: "sess-1",
      model: { providerID: model!.providerID, id: model!.id },
      error: { type: "provider.rate-limit", message: "429", status: 429 },
      attempt: 2,
      decision: { retry: true, delay: 1000 },
    });

    const state = await readSharedState(paths.statePath);
    expect(state.unavailable.map((mark) => mark.id)).toContain(`${model?.providerID}/${model?.id}`);
    expect(state.task_history).toEqual([]);
  });

  test("low rate-limit remaining cools the model off for the primary request only", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    const { model } = await harness.drive("Refactor the router safely");
    const routed = { providerID: model!.providerID, id: model!.id };

    await harness.httpResponse({
      kind: "title",
      sessionID: "sess-1",
      model: routed,
      response: new Response(null, { headers: { "x-ratelimit-remaining": "0" } }),
    });
    expect((await readSharedState(paths.statePath)).unavailable).toEqual([]);

    await harness.httpResponse({
      kind: "primary",
      sessionID: "sess-1",
      model: routed,
      response: new Response(null, { headers: { "x-ratelimit-remaining": "2" } }),
    });
    const state = await readSharedState(paths.statePath);
    expect(state.unavailable.map((mark) => mark.id)).toContain(`${routed.providerID}/${routed.id}`);
  });

  test("interrupted session does not inherit another session's success", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    await harness.drive("alpha task stays open", { sessionID: "sess-a", messageID: "a" });
    await harness.drive("beta task completes", { sessionID: "sess-b", messageID: "b" });
    await harness.emitEvent("session.execution.interrupted", { sessionID: "sess-a", reason: "user" });
    await harness.emitEvent("session.execution.succeeded", { sessionID: "sess-b" });

    const state = await readSharedState(paths.statePath);
    expect(state.task_history).toHaveLength(1);
    expect(state.task_history[0]?.success).toBe(true);
    expect(state.task_history[0]?.task_excerpt).toContain("beta task");
  });

  test("step.ended records edit size from output tokens when files changed", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    await harness.drive("Refactor the router safely");
    await harness.emitEvent("session.step.ended", {
      sessionID: "sess-1",
      assistantMessageID: "asst-1",
      finish: "stop",
      cost: 0.02,
      tokens: { input: 20, output: 250, reasoning: 0, cache: { read: 0, write: 0 } },
      files: ["src/router.ts"],
    });

    const state = await readSharedState(paths.statePath);
    expect(state.task_history[0]?.success).toBe(true);
    expect(state.task_history[0]?.diff_size).toBe(250);
  });

  test("one busy period records each admitted prompt", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    await harness.drive("alpha task", { messageID: "a" });
    await harness.drive("beta task", { messageID: "b" });
    await harness.emitEvent("session.execution.succeeded", { sessionID: "sess-1" });

    const state = await readSharedState(paths.statePath);
    expect(state.task_history).toHaveLength(2);
    expect(state.task_history.map((outcome) => outcome.task_excerpt).sort()).toEqual([
      "alpha task",
      "beta task",
    ]);
  });

  test("a repeated message id does not route twice", async () => {
    const paths = makeTempPaths();
    const harness = await activate(paths, mockRunner({
      long_context: 0.4,
      deep_reasoning: 0.8,
      tool_use_accuracy: 0.9,
      speed_priority: 0.1,
      frontend_taste: 0.1,
      cost_efficiency: 0.2,
    }));
    await harness.drive("hello again", { messageID: "same" });
    await harness.drive("hello again", { messageID: "same" });
    expect(harness.switchCount).toBe(1);
  });
});
