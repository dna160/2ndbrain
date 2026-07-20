/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/memory/math.ts
 * Role    : Pure memory-write math (docs/00 F4, docs/04 §3) — EMA confidence/strength merge,
 *           cosine similarity, dedupe thresholds, salience decay. QC-gated at 100%.
 * Exports : emaMerge, cosineSimilarity, classifyDedupe, decaySalience, needsReview
 */
export const EMA_ALPHA = 0.3;
export const MERGE_THRESHOLD = 0.88;
export const CONTRADICTION_THRESHOLD = 0.75;
export const DECAY_FACTOR = 0.98;
export const SALIENCE_FLOOR = 0.05;
export const LOW_CONFIDENCE = 0.6;

/** Exponential moving average — Lynkbot genome merge pattern. */
export function emaMerge(prev: number, next: number, alpha: number = EMA_ALPHA): number {
  return prev * (1 - alpha) + next * alpha;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type DedupeVerdict = 'merge' | 'contradiction' | 'insert';

/** cosine ≥0.88 → merge; 0.75-0.88 + semantic contradiction → review; else insert. */
export function classifyDedupe(similarity: number, contradicts: boolean): DedupeVerdict {
  if (similarity >= MERGE_THRESHOLD) return 'merge';
  if (similarity >= CONTRADICTION_THRESHOLD && contradicts) return 'contradiction';
  return 'insert';
}

/** ×0.98 daily, floored at 0.05 (docs/04 §3). */
export function decaySalience(
  salience: number,
  factor: number = DECAY_FACTOR,
  floor: number = SALIENCE_FLOOR,
): number {
  return Math.max(floor, salience * factor);
}

export function needsReview(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE;
}
