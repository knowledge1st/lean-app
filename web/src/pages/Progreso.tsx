import { EmptyState } from '../components/ui/EmptyState';

export function Progreso() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Progreso</h1>
      <EmptyState
        title="Todavía no hay registros de progreso"
        description="Acá podrás seguir tus medidas y ver cómo avanzás con el tiempo."
      />
    </section>
  );
}
