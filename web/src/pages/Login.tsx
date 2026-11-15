import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage('');
    const nextErrors = {
      username: username.trim() ? '' : 'Ingresá tu usuario.',
      password: password ? '' : 'Ingresá tu contraseña.',
    };
    setErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) return;
    setPending(true);
    try {
      await login(username, password);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMessage('Usuario o contraseña incorrectos.');
        setPassword('');
        passwordRef.current?.focus();
      } else if (error instanceof ApiError && error.status === 429) {
        setMessage('Demasiados intentos. Esperá 15 minutos y volvé a probar.');
      } else if (
        !navigator.onLine ||
        (error instanceof ApiError && (error.status === 0 || error.code === 'network_error'))
      ) {
        setMessage('Sin conexión. Revisá tu internet y volvé a intentar.');
      } else {
        setMessage('No se pudo iniciar sesión. Probá de nuevo.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8">
      <Card className="w-full space-y-6">
        <div>
          <p className="mb-2 font-semibold text-accent">Lean</p>
          <h1 className="text-3xl font-bold">Iniciar sesión</h1>
        </div>
        <form className="space-y-5" onSubmit={submit} noValidate>
          <Input
            label="Usuario"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={errors.username ?? ''}
          />
          <Input
            ref={passwordRef}
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password ?? ''}
          />
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
