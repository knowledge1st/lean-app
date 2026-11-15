import { EmptyState } from '../components/ui/EmptyState';

export function Plan() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Plan</h1>
      <EmptyState
        title="Tu plan empieza acá"
        description="Acá podrás organizar tus comidas y consultar tu plan semanal."
      />
    </section>
  );
}
