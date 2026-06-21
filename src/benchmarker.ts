import type {
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkScore,
  Catalog,
  ModelEntry,
  TraitWeights,
} from "./types.js";
import type { CompletionRunner } from "./classifier.js";
import { benchmark } from "./config.js";

const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    name: "speed_ping",
    prompt: "Return the number 42.",
    expected_traits: { speed_priority: 1 },
    max_expected_ms: 3000,
  },
  {
    name: "code_gen",
    prompt: "Write a Python function to check if a string is a palindrome.",
    expected_traits: { tool_use_accuracy: 0.8 },
    max_expected_ms: 10000,
  },
  {
    name: "reasoning",
    prompt: "If all bloops are razzles and all razzles are lazzles, are all bloops lazzles? Explain step by step.",
    expected_traits: { deep_reasoning: 1 },
    max_expected_ms: 15000,
  },
];

export { BENCHMARK_TASKS };

export function shouldBenchmark(lastBenchmark: number, intervalMs: number): boolean {
  if (lastBenchmark === 0) return true;
  return Date.now() - lastBenchmark > intervalMs;
}

export async function runBenchmark(
  model: ModelEntry,
  tasks: BenchmarkTask[],
  runner: CompletionRunner,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const task of tasks) {
    const start = Date.now();
    let success = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), benchmark.timeout_ms);
      await runner({ systemPrompt: "", userPrompt: task.prompt });
      clearTimeout(timeout);
      success = true;
    } catch {
      success = false;
    }
    results.push({
      model_id: model.id,
      task_name: task.name,
      latency_ms: Date.now() - start,
      success,
      timestamp: Date.now(),
    });
  }

  return results;
}

export function computeScoreDelta(
  result: BenchmarkResult,
  task: BenchmarkTask,
  catalogScore: number,
): number {
  if (!result.success) return -0.5;

  const ratio = result.latency_ms / task.max_expected_ms;
  if (ratio <= 0.5) return Math.min(benchmark.max_adjustment, 0.3);
  if (ratio <= 1.0) return 0.1;
  if (ratio <= 2.0) return -0.1;
  return Math.max(-benchmark.max_adjustment, -0.3);
}

export function analyzeResults(
  results: BenchmarkResult[],
  catalog: Catalog,
): BenchmarkScore[] {
  const byModel = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const list = byModel.get(r.model_id) ?? [];
    list.push(r);
    byModel.set(r.model_id, list);
  }

  const scores: BenchmarkScore[] = [];
  for (const [modelId, modelResults] of byModel) {
    const model = catalog.models.find((m) => m.id === modelId);
    if (!model) continue;

    const avgLatency =
      modelResults.reduce((sum, r) => sum + r.latency_ms, 0) / modelResults.length;
    const successRate =
      modelResults.filter((r) => r.success).length / modelResults.length;

    let totalDelta = 0;
    for (const r of modelResults) {
      const task = BENCHMARK_TASKS.find((t) => t.name === r.task_name);
      if (!task) continue;
      const relevantTrait = Object.entries(task.expected_traits)[0];
      const catalogScore = relevantTrait
        ? model.scores[relevantTrait[0] as keyof typeof model.scores] ?? 5
        : 5;
      totalDelta += computeScoreDelta(r, task, catalogScore);
    }

    scores.push({
      model_id: modelId,
      avg_latency_ms: avgLatency,
      success_rate: successRate,
      score_delta: totalDelta / modelResults.length,
      last_benchmark: Date.now(),
    });
  }

  return scores;
}
