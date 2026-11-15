import { EmptyState } from '../components/ui/EmptyState';

export function Perfil() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Perfil</h1>
      <EmptyState
        title="Tu perfil está por completar"
        description="Acá podrás configurar tus datos, preferencias y objetivos."
      />
    </section>
  );
}
