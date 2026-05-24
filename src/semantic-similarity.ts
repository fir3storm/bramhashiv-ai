/**
 * Semantic similarity for code tasks — replaces Jaccard with a more
 * robust measure that understands code structure.
 *
 * Combines:
 *   1. Token-level similarity (normalized identifiers, keywords)
 *   2. Character n-gram similarity (catches typos, small edits)
 *   3. Structural similarity (line count, code block presence)
 */

import { regeneration as cfg } from "./config.js";

/** Normalize code identifiers: camelCase → camel case, snake_case → snake case */
function normalizeIdentifiers(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Extract code-specific tokens (function names, file extensions, keywords) */
function extractCodeTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = normalizeIdentifiers(text);

  for (const word of words) {
    tokens.add(word);
    // Add stemmed version for common suffixes
    if (word.endsWith("ing")) tokens.add(word.slice(0, -3));
    if (word.endsWith("ed")) tokens.add(word.slice(0, -2));
    if (word.endsWith("s") && word.length > 3) tokens.add(word.slice(0, -1));
  }

  // Extract file extensions
  const extMatches = text.match(/\.([a-zA-Z0-9]+)\b/g);
  if (extMatches) {
    for (const ext of extMatches) tokens.add(ext.toLowerCase());
  }

  // Extract quoted strings (likely identifiers)
  const quoteMatches = text.match(/['"`]([a-zA-Z0-9_]+)['"`]/g);
  if (quoteMatches) {
    for (const match of quoteMatches) tokens.add(match.slice(1, -1).toLowerCase());
  }

  return tokens;
}

/** Character n-grams for catching small edits and typos */
function charNgrams(text: string, n: number = 3): Map<string, number> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const grams = new Map<string, number>();
  for (let i = 0; i <= normalized.length - n; i++) {
    const gram = normalized.slice(i, i + n);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Cosine similarity between two frequency maps */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    const valB = b.get(key) ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
  }

  for (const val of b.values()) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Jaccard similarity for sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/** Structural features: line count ratio, code block presence */
function structuralSimilarity(a: string, b: string): number {
  const linesA = a.split("\n").length;
  const linesB = b.split("\n").length;
  const lineRatio = Math.min(linesA, linesB) / Math.max(linesA, linesB);

  const hasCodeA = /```|[{}();=]/.test(a);
  const hasCodeB = /```|[{}();=]/.test(b);
  const codeMatch = hasCodeA === hasCodeB ? 1 : 0.5;

  return (lineRatio + codeMatch) / 2;
}

export function semanticSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;

  // Token similarity (code-aware)
  const tokensA = extractCodeTokens(a);
  const tokensB = extractCodeTokens(b);
  const tokenSim = jaccardSimilarity(tokensA, tokensB);

  // Character n-gram similarity (catches small edits)
  const ngramsA = charNgrams(a, 3);
  const ngramsB = charNgrams(b, 3);
  const ngramSim = cosineSimilarity(ngramsA, ngramsB);

  // Structural similarity
  const structSim = structuralSimilarity(a, b);

  // Weighted combination
  return tokenSim * 0.5 + ngramSim * 0.35 + structSim * 0.15;
}

/**
 * Legacy Jaccard for backward compatibility when
 * BRAMHASHIV_SEMANTIC_SIMILARITY=0 is set.
 */
function legacyJaccard(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function computeTaskSimilarity(a: string, b: string): number {
  const useSemantic = process.env.BRAMHASHIV_SEMANTIC_SIMILARITY !== "0";
  return useSemantic ? semanticSimilarity(a, b) : legacyJaccard(a, b);
}
