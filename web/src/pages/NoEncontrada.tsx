import { Link } from 'react-router';

export function NoEncontrada() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <Link
        to="/hoy"
        className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 font-semibold text-accent"
      >
        Ir a Hoy
      </Link>
    </div>
  );
}
