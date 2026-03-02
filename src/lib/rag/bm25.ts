export function scoreBM25(
  queryTerms: string[],
  docTerms: string[],
  idf: Record<string, number>,
  avgDl: number,
  k1 = 1.5,
  b = 0.75,
): number {
  const dl = docTerms.length;
  if (dl === 0) return 0;

  // Build term frequency map for the document
  const tf: Record<string, number> = {};
  for (const term of docTerms) {
    tf[term] = (tf[term] || 0) + 1;
  }

  let score = 0;
  for (const term of queryTerms) {
    const termFreq = tf[term] || 0;
    if (termFreq === 0) continue;

    const termIdf = idf[term] || 0;
    const numerator = termFreq * (k1 + 1);
    const denominator = termFreq + k1 * (1 - b + b * (dl / avgDl));
    score += termIdf * (numerator / denominator);
  }

  return score;
}
