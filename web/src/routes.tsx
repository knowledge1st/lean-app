import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { Login } from './pages/Login';
import { Hoy } from './pages/Hoy';
import { Plan } from './pages/Plan';
import { Compras } from './pages/Compras';
import { Progreso } from './pages/Progreso';
import { Perfil } from './pages/Perfil';
import { RequireAuth, RedirectIfAuthenticated } from './auth/RequireAuth';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/hoy" element={<Hoy />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/progreso" element={<Progreso />} />
          <Route path="/perfil" element={<Perfil />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/hoy" replace />} />
      <Route path="*" element={<Navigate to="/hoy" replace />} />
    </Routes>
  );
}
