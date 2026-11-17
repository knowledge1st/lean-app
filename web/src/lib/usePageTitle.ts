import { useEffect } from 'react';
import { useLocation } from 'react-router';

const titles: Record<string, string> = {
  '/': 'Hoy',
  '/hoy': 'Hoy',
  '/plan': 'Plan',
  '/compras': 'Compras',
  '/progreso': 'Progreso',
  '/perfil': 'Perfil',
  '/login': 'Ingresar',
  '/objetivo/nuevo': 'Tu objetivo',
};

export function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${titles[pathname.replace(/\/$/, '') || '/'] ?? 'Página no encontrada'} · Lean`;
  }, [pathname]);
}
