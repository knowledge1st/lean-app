import { NavLink } from 'react-router';

const tabs = [
  {
    path: '/hoy',
    label: 'Hoy',
    icon: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  },
  {
    path: '/plan',
    label: 'Plan',
    icon: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h3m3 0h2m-8 3h3',
  },
  { path: '/compras', label: 'Compras', icon: 'm3 3 2 2 2 12h12l2-9H6m3 13h.01M18 21h.01' },
  { path: '/progreso', label: 'Progreso', icon: 'M4 3v17h17M8 15l4-5 4 2 5-7' },
  {
    path: '/perfil',
    label: 'Perfil',
    icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-5 px-2">
        {tabs.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex min-h-18 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium ${isActive ? 'text-accent' : 'text-muted'}`
            }
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={icon} />
            </svg>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
