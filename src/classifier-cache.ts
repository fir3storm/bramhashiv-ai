/**
 * Semantic cache for classifier results.
 * Uses semantic similarity to cache and reuse classifier results for similar tasks.
 */

import type { ClassifierResult } from "./types.js";
import { semanticSimilarity } from "./semantic-similarity.js";

interface CacheEntry {
  taskText: string;
  result: ClassifierResult;
  timestamp: number;
}

const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SIMILARITY_THRESHOLD = 0.85;

let cache: CacheEntry[] = [];

export function getCachedClassifier(taskText: string): ClassifierResult | null {
  const now = Date.now();

  // Evict expired entries
  cache = cache.filter((e) => now - e.timestamp < CACHE_TTL_MS);

  for (const entry of cache) {
    const similarity = semanticSimilarity(taskText, entry.taskText);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return entry.result;
    }
  }

  return null;
}

export function setCachedClassifier(taskText: string, result: ClassifierResult): void {
  cache.push({
    taskText,
    result,
    timestamp: Date.now(),
  });

  // Evict oldest entries if cache is too large
  if (cache.length > CACHE_MAX_SIZE) {
    cache.sort((a, b) => b.timestamp - a.timestamp);
    cache = cache.slice(0, CACHE_MAX_SIZE);
  }
}

export function clearClassifierCache(): void {
  cache = [];
}

export function getCacheSize(): number {
  return cache.length;
}