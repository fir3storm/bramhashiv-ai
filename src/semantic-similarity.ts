/**
 * Lightweight semantic similarity using character n-gram overlap (Jaccard).
 * Uses both bigrams and trigrams for better matching on short strings.
 * This avoids external dependencies while providing reasonable similarity
 * detection for classifier caching purposes.
 */

function getNgrams(text: string, n: number): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

/**
 * Compute similarity between two strings using Jaccard index on
 * combined bigram and trigram sets for robust short-string matching.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function semanticSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const bigramsA = getNgrams(a, 2);
  const bigramsB = getNgrams(b, 2);
  const trigramsA = getNgrams(a, 3);
  const trigramsB = getNgrams(b, 3);

  // Combine bigram and trigram sets
  const allA = new Set([...bigramsA, ...trigramsA]);
  const allB = new Set([...bigramsB, ...trigramsB]);

  if (allA.size === 0 || allB.size === 0) return 0;

  let intersection = 0;
  for (const gram of allA) {
    if (allB.has(gram)) intersection++;
  }

  const union = new Set([...allA, ...allB]).size;
  return intersection / union;
}