export const TREND_ALPHA = 0.1;
export interface WeightPoint {
  date: string;
  weightKg: number | null;
}
export interface TrendPoint extends WeightPoint {
  trendWeightKg: number | null;
}
export function computeTrend(points: readonly WeightPoint[], alpha = TREND_ALPHA): TrendPoint[] {
  let trend: number | null = null;
  return [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => {
      if (point.weightKg !== null)
        trend = trend === null ? point.weightKg : trend + alpha * (point.weightKg - trend);
      return { ...point, trendWeightKg: trend };
    });
}
