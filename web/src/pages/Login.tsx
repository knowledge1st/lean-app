import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

export function Login() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8">
      <Card className="w-full space-y-6">
        <div>
          <p className="mb-2 font-semibold text-accent">Lean</p>
          <h1 className="text-3xl font-bold">Iniciar sesión</h1>
        </div>
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          <Input label="Usuario" name="username" autoComplete="username" />
          <Input
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
          />
          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
