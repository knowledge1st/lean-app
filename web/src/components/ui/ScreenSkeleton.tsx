import { Skeleton } from './Skeleton';

export function ScreenSkeleton() {
  return (
    <div role="status" aria-label="Cargando pantalla" aria-busy="true" className="space-y-6">
      <span className="sr-only">Cargando pantalla</span>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
