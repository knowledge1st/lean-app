import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { Login } from './pages/Login';
import { Hoy } from './pages/Hoy';
import { RequireAuth, RedirectIfAuthenticated } from './auth/RequireAuth';
import { NoEncontrada } from './pages/NoEncontrada';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ScreenSkeleton } from './components/ui/ScreenSkeleton';
import { usePageTitle } from './lib/usePageTitle';

const ObjetivoNuevo = lazy(() =>
  import('./pages/ObjetivoNuevo').then((module) => ({ default: module.ObjetivoNuevo })),
);
const Plan = lazy(() => import('./pages/Plan').then((module) => ({ default: module.Plan })));
const Compras = lazy(() =>
  import('./pages/Compras').then((module) => ({ default: module.Compras })),
);
const Progreso = lazy(() =>
  import('./pages/Progreso').then((module) => ({ default: module.Progreso })),
);
const Perfil = lazy(() => import('./pages/Perfil').then((module) => ({ default: module.Perfil })));

function StandaloneRoute() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<ScreenSkeleton />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

export function AppRoutes() {
  usePageTitle();
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route element={<StandaloneRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<StandaloneRoute />}>
          <Route path="/objetivo/nuevo" element={<ObjetivoNuevo />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route path="/hoy" element={<Hoy />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/progreso" element={<Progreso />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/hoy" replace />} />
    </Routes>
  );
}
