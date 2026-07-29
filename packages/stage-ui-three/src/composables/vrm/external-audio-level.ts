export const MOUTH_WEIGHT_CAP = 0.7

export function externalMouthTarget(level: number) {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))
  return Math.min(MOUTH_WEIGHT_CAP, normalized ** 0.7 * MOUTH_WEIGHT_CAP)
}
