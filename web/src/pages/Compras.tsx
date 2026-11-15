import { EmptyState } from '../components/ui/EmptyState';

export function Compras() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
      <EmptyState
        title="Tu lista de compras está vacía"
        description="Acá encontrarás los ingredientes que necesitás para tu plan."
      />
    </section>
  );
}
