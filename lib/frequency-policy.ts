export const FREQUENCY_POLICY_VERSION = 2

export interface FrequencyPercentiles {
  nb: number
  nowacLemma: number
  eiesland?: number
}

export const GENERATION_THRESHOLDS = [
  { difficulty: 'easy', absoluteFamiliarity: 0.84, normalizedSalience: 0.98, endpointFamiliarity: 0.70 },
  { difficulty: 'medium', absoluteFamiliarity: 0.65, normalizedSalience: 0.90, endpointFamiliarity: 0.45 },
  { difficulty: 'hard', absoluteFamiliarity: 0.40, normalizedSalience: 0.70, endpointFamiliarity: 0.25 },
] as const

export function compoundFamiliarity(values: FrequencyPercentiles): number {
  return 0.3 * values.nb + 0.6 * values.nowacLemma + 0.1 * (values.eiesland ?? 0)
}

export function endpointFamiliarity(values: Pick<FrequencyPercentiles, 'nb' | 'nowacLemma'>): number {
  return 0.3 * values.nb + 0.7 * values.nowacLemma
}

export function normalizedContinuationRank(rank: number, continuationCount: number): number {
  if (continuationCount <= 1) return 1
  return 1 - (rank - 1) / (continuationCount - 1)
}

export function generationTier(absoluteFamiliarity: number, normalizedSalience: number): number {
  return GENERATION_THRESHOLDS.findIndex(threshold =>
    absoluteFamiliarity >= threshold.absoluteFamiliarity &&
    normalizedSalience >= threshold.normalizedSalience
  )
}

export function endpointTier(familiarity: number): number {
  return GENERATION_THRESHOLDS.findIndex(threshold => familiarity >= threshold.endpointFamiliarity)
}

export function weakestEdgeScore(scores: number[]): number {
  return scores.length > 0 ? Math.min(...scores) : 0
}
