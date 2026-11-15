import { Navigate, Outlet } from 'react-router';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from './AuthProvider';

function AuthLoading() {
  return (
    <main aria-busy="true" aria-label="Cargando" className="min-h-dvh space-y-6 p-6">
      <span className="sr-only">Cargando</span>
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}

export function RequireAuth() {
  const { status, retry } = useAuth();
  if (status === 'loading') return <AuthLoading />;
  if (status === 'error') {
    return (
      <main className="min-h-dvh p-6">
        <ErrorState message="No se pudo verificar tu sesión. Probá de nuevo." onRetry={retry} />
      </main>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  if (status === 'loading') return <AuthLoading />;
  if (status === 'authenticated') return <Navigate to="/hoy" replace />;
  return <Outlet />;
}
