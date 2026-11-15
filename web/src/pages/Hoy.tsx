import { EmptyState } from '../components/ui/EmptyState';

export function Hoy() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Hoy</h1>
      <EmptyState
        title="Todavía no cargaste nada hoy"
        description="Acá verás tus comidas y el resumen de tu día."
      />
    </section>
  );
}
