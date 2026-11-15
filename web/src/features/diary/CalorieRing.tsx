export function CalorieRing({ kcal, target }: { kcal: number; target?: number | undefined }) {
  const progress = target && target > 0 ? Math.min(kcal / target, 1) : 0;
  return (
    <div className="text-center">
      <div className="relative mx-auto h-40 w-40">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
          {progress > 0 && (
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeDasharray={`${progress * 327} 327`}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <strong className="text-3xl">{kcal}</strong>
          <span className="text-sm text-muted">kcal consumidas</span>
        </div>
      </div>
      {target != null && (
        <p className="text-sm text-muted">
          {kcal <= target ? `quedan ${target - kcal} kcal` : `${kcal - target} kcal de más`}
        </p>
      )}
    </div>
  );
}
