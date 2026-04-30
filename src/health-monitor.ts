import type { HealthRecord } from "./types.js";
import { health as cfg } from "./config.js";

export function createHealthRecord(provider: string, model_id: string): HealthRecord {
  return {
    provider,
    model_id,
    latency_samples: [],
    error_count: 0,
    success_count: 0,
    last_used: 0,
    health_score: 1.0,
  };
}

function exponentialMovingAverage(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let ema: number = values[0]!;
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i]! + (1 - alpha) * ema;
  }
  return ema;
}

function computeHealthScore(record: HealthRecord): number {
  const totalCalls = record.success_count + record.error_count;
  if (totalCalls === 0) return 1.0;

  const successRate = record.success_count / totalCalls;

  let latencyPenalty = 0;
  if (record.latency_samples.length > 0) {
    const avgLatency = exponentialMovingAverage(record.latency_samples, cfg.decay_alpha);
    const normalizedLatency = Math.min(avgLatency / cfg.latency_baseline_ms, 1);
    latencyPenalty = normalizedLatency * 0.3;
  }

  const errorPenalty = (1 - successRate) * 0.7;

  return Math.max(0, 1 - latencyPenalty - errorPenalty);
}

export function recordLatency(record: HealthRecord, latencyMs: number): HealthRecord {
  const samples = [...record.latency_samples, latencyMs];
  if (samples.length > cfg.max_latency_samples) samples.shift();
  const updated = { ...record, latency_samples: samples, last_used: Date.now() };
  updated.health_score = computeHealthScore(updated);
  return updated;
}

export function recordSuccess(record: HealthRecord, latencyMs: number): HealthRecord {
  const withLatency = recordLatency(record, latencyMs);
  const updated = { ...withLatency, success_count: withLatency.success_count + 1 };
  updated.health_score = computeHealthScore(updated);
  return updated;
}

export function recordError(record: HealthRecord): HealthRecord {
  const updated = { ...record, error_count: record.error_count + 1, last_used: Date.now() };
  updated.health_score = computeHealthScore(updated);
  return updated;
}

export function findOrCreateHealth(
  records: HealthRecord[],
  provider: string,
  model_id: string,
): { records: HealthRecord[]; record: HealthRecord; index: number } {
  const idx = records.findIndex((r) => r.model_id === model_id);
  if (idx >= 0) {
    return { records, record: records[idx]!, index: idx };
  }

  const record = createHealthRecord(provider, model_id);
  return { records: [...records, record], record, index: records.length };
}

export function getHealthPenalty(score: number): number {
  if (score >= cfg.threshold_healthy) return cfg.penalty_healthy;
  if (score >= cfg.threshold_degraded) return cfg.penalty_degraded;
  if (score >= cfg.threshold_poor) return cfg.penalty_poor;
  return cfg.penalty_critical;
}
